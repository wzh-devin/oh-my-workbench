package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
)

// 同步游标、任务和监听租约；事务阻止过期执行者写入。
func (r *Repository) EnabledAccounts(ctx context.Context) ([]maildomain.Account, error) {
	records := []maildomain.Account{}
	err := r.db.WithContext(ctx).Where("enabled = true").Find(&records).Error
	return records, err
}

func (r *Repository) ClaimListener(ctx context.Context, id int64, token string) (bool, error) {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&maildomain.Account{}).Where("id = ? AND enabled AND (lease_until IS NULL OR lease_until < ?)", id, now).
		Updates(map[string]any{"lease_token": token, "lease_until": now.Add(45 * time.Second)})
	return result.RowsAffected == 1, result.Error
}

func (r *Repository) RenewListener(ctx context.Context, a maildomain.Account, token string) error {
	result := r.db.WithContext(ctx).Model(&maildomain.Account{}).
		Where("id = ? AND enabled AND lease_token = ? AND lease_until > ?", a.ID, token, time.Now().UTC()).
		Update("lease_until", time.Now().UTC().Add(45*time.Second))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return maildomain.ErrLease
	}
	return nil
}

// leased fences every sync transaction against pauses, credential changes and expired workers.
func (r *Repository) leased(ctx context.Context, id int64, token string, work func(*gorm.DB, maildomain.Account) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var a maildomain.Account
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&a).Error; err != nil {
			return err
		}
		if !a.Enabled || a.LeaseToken == nil || *a.LeaseToken != token || a.LeaseUntil == nil || !a.LeaseUntil.After(time.Now()) {
			return maildomain.ErrLease
		}
		return work(tx, a)
	})
}

func (r *Repository) ReleaseListener(ctx context.Context, id int64, token string) error {
	return r.db.WithContext(ctx).Model(&maildomain.Account{}).Where("id = ? AND lease_token = ?", id, token).
		Updates(map[string]any{"lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
}

func (r *Repository) ListenerError(ctx context.Context, a maildomain.Account, token, reason string) {
	_ = r.db.WithContext(ctx).Model(&maildomain.Account{}).Where("id = ? AND lease_token = ?", a.ID, token).
		Updates(map[string]any{"last_error": reason, "updated_at": time.Now().UTC()}).Error
	r.Changed(ctx, a.UserID)
}

func (r *Repository) PrepareMailbox(ctx context.Context, a maildomain.Account, token string, validity, ceiling uint32) (maildomain.Mailbox, error) {
	var box maildomain.Mailbox
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ maildomain.Account) error {
		err := tx.Where("account_id = ? AND remote_name = 'INBOX'", a.ID).First(&box).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			box = maildomain.Mailbox{Record: maildomain.NewRecord(a.UserID), AccountID: a.ID, RemoteName: "INBOX", UIDValidity: validity, NotificationBoundary: ceiling, LiveUID: ceiling, HistoryDone: ceiling == 0}
			return tx.Create(&box).Error
		}
		if err != nil {
			return err
		}
		if box.UIDValidity != validity {
			box.UIDValidity = validity
			box.NotificationBoundary = ceiling
			box.LiveUID = ceiling
			box.HistoryUID = 0
			box.HistoryDone = ceiling == 0
			box.UpdatedAt = time.Now().UTC()
			return tx.Save(&box).Error
		}
		return nil
	})
	return box, err
}

func (r *Repository) BeginSync(ctx context.Context, a maildomain.Account, token, trigger string) (maildomain.SyncJob, error) {
	var job maildomain.SyncJob
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ maildomain.Account) error {
		err := tx.Where("account_id = ? AND status IN ?", a.ID, []string{"queued", "running"}).First(&job).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			job = maildomain.SyncJob{Record: maildomain.NewRecord(a.UserID), AccountID: a.ID, Trigger: trigger, Status: "queued"}
			if err := tx.Create(&job).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		now := time.Now().UTC()
		job.Status = "running"
		job.StartedAt = &now
		job.UpdatedAt = now
		return tx.Save(&job).Error
	})
	return job, err
}

func (r *Repository) FinishSync(ctx context.Context, a maildomain.Account, token string, job maildomain.SyncJob, syncErr error) error {
	return r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ maildomain.Account) error {
		now := time.Now().UTC()
		changes := map[string]any{"status": "succeeded", "finished_at": now, "updated_at": now}
		accountChanges := map[string]any{"last_sync_at": now, "last_error": nil, "updated_at": now}
		if syncErr != nil {
			changes["status"] = "failed"
			changes["last_error"] = maildomain.ErrUnavailable.Error()
			accountChanges = map[string]any{"last_error": maildomain.ErrUnavailable.Error(), "updated_at": now}
		}
		if err := tx.Model(&maildomain.SyncJob{}).Where("id = ? AND status = 'running'", job.ID).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&maildomain.Account{}).Where("id = ?", a.ID).Updates(accountChanges).Error
	})
}

// saveBatch commits content, notification outbox and cursor together; replays are harmless.
func (r *Repository) SaveBatch(ctx context.Context, a maildomain.Account, token string, box *maildomain.Mailbox, jobID int64, records []maildomain.IncomingMessage, cursor uint32, history, done bool) error {
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, current maildomain.Account) error {
		var enabled bool
		if err := tx.Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", a.UserID).Scan(&enabled).Error; err != nil {
			return err
		}
		for _, record := range records {
			m := record.Message
			m.Record = maildomain.NewRecord(a.UserID)
			m.AccountID = a.ID
			m.MailboxID = box.ID
			m.UIDValidity = box.UIDValidity
			m.Version = 1
			m.AttachmentCount = len(record.Attachments)
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&m)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			for _, attachment := range record.Attachments {
				attachment.Record = maildomain.NewRecord(a.UserID)
				attachment.MessageID = m.ID
				if err := tx.Create(&attachment).Error; err != nil {
					return err
				}
			}
			if !history && current.NotifyEnabled {
				notification := maildomain.Notification{Record: maildomain.NewRecord(a.UserID), MessageID: m.ID}
				if err := tx.Create(&notification).Error; err != nil {
					return err
				}
				if enabled {
					var subscriptions []maildomain.PushSubscription
					if err := tx.Where("user_id = ? AND enabled", a.UserID).Find(&subscriptions).Error; err != nil {
						return err
					}
					for _, subscription := range subscriptions {
						delivery := maildomain.PushDelivery{Record: maildomain.NewRecord(a.UserID), NotificationID: notification.ID, SubscriptionID: subscription.ID, Status: "queued", NextRetryAt: time.Now().UTC()}
						if err := tx.Create(&delivery).Error; err != nil {
							return err
						}
					}
				}
			}
		}
		changes := map[string]any{"updated_at": time.Now().UTC()}
		if history {
			changes["history_uid"] = cursor
			changes["history_done"] = done
		} else {
			changes["live_uid"] = cursor
		}
		if err := tx.Model(&maildomain.Mailbox{}).Where("id = ? AND uid_validity = ?", box.ID, box.UIDValidity).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&maildomain.SyncJob{}).Where("id = ?", jobID).Updates(map[string]any{"processed_count": gorm.Expr("processed_count + ?", len(records)), "updated_at": time.Now().UTC()}).Error
	})
	if err == nil {
		if history {
			box.HistoryUID = cursor
			box.HistoryDone = done
		} else {
			box.LiveUID = cursor
		}
		r.Changed(ctx, a.UserID)
	}
	return err
}

func (r *Repository) HasQueuedSync(ctx context.Context, id int64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&maildomain.SyncJob{}).Where("account_id = ? AND status = 'queued'", id).Count(&count).Error
	return count > 0, err
}
