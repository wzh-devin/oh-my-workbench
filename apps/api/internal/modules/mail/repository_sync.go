// 同步游标、任务和监听租约；事务阻止过期执行者写入。
package mail

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (r *Repository) enabledAccounts(ctx context.Context) ([]Account, error) {
	records := []Account{}
	err := r.db.WithContext(ctx).Where("enabled = true").Find(&records).Error
	return records, err
}
func (r *Repository) claimListener(ctx context.Context, id int64, token string) (bool, error) {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&Account{}).Where("id = ? AND enabled AND (lease_until IS NULL OR lease_until < ?)", id, now).
		Updates(map[string]any{"lease_token": token, "lease_until": now.Add(45 * time.Second)})
	return result.RowsAffected == 1, result.Error
}
func (r *Repository) renewListener(ctx context.Context, a Account, token string) error {
	result := r.db.WithContext(ctx).Model(&Account{}).
		Where("id = ? AND enabled AND lease_token = ? AND lease_until > ?", a.ID, token, time.Now().UTC()).
		Update("lease_until", time.Now().UTC().Add(45*time.Second))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrLease
	}
	return nil
}

// leased fences every sync transaction against pauses, credential changes and expired workers.
func (r *Repository) leased(ctx context.Context, id int64, token string, work func(*gorm.DB, Account) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var a Account
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&a).Error; err != nil {
			return err
		}
		if !a.Enabled || a.LeaseToken == nil || *a.LeaseToken != token || a.LeaseUntil == nil || !a.LeaseUntil.After(time.Now()) {
			return ErrLease
		}
		return work(tx, a)
	})
}
func (r *Repository) releaseListener(ctx context.Context, id int64, token string) error {
	return r.db.WithContext(ctx).Model(&Account{}).Where("id = ? AND lease_token = ?", id, token).
		Updates(map[string]any{"lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
}
func (r *Repository) listenerError(ctx context.Context, a Account, token, reason string) {
	_ = r.db.WithContext(ctx).Model(&Account{}).Where("id = ? AND lease_token = ?", a.ID, token).
		Updates(map[string]any{"last_error": reason, "updated_at": time.Now().UTC()}).Error
	r.changed(ctx, a.UserID)
}
func (r *Repository) prepareMailbox(ctx context.Context, a Account, token string, validity, ceiling uint32) (Mailbox, error) {
	var box Mailbox
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ Account) error {
		err := tx.Where("account_id = ? AND remote_name = 'INBOX'", a.ID).First(&box).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			box = Mailbox{Record: newRecord(a.UserID), AccountID: a.ID, RemoteName: "INBOX", UIDValidity: validity, NotificationBoundary: ceiling, LiveUID: ceiling, HistoryDone: ceiling == 0}
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
func (r *Repository) beginSync(ctx context.Context, a Account, token, trigger string) (SyncJob, error) {
	var job SyncJob
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ Account) error {
		err := tx.Where("account_id = ? AND status IN ?", a.ID, []string{"queued", "running"}).First(&job).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			job = SyncJob{Record: newRecord(a.UserID), AccountID: a.ID, Trigger: trigger, Status: "queued"}
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
func (r *Repository) finishSync(ctx context.Context, a Account, token string, job SyncJob, syncErr error) error {
	return r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ Account) error {
		now := time.Now().UTC()
		changes := map[string]any{"status": "succeeded", "finished_at": now, "updated_at": now}
		accountChanges := map[string]any{"last_sync_at": now, "last_error": nil, "updated_at": now}
		if syncErr != nil {
			changes["status"] = "failed"
			changes["last_error"] = ErrUnavailable.Error()
			accountChanges = map[string]any{"last_error": ErrUnavailable.Error(), "updated_at": now}
		}
		if err := tx.Model(&SyncJob{}).Where("id = ? AND status = 'running'", job.ID).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&Account{}).Where("id = ?", a.ID).Updates(accountChanges).Error
	})
}

type incomingMessage struct {
	Message     Message
	Attachments []Attachment
}

// saveBatch commits content, notification outbox and cursor together; replays are harmless.
func (r *Repository) saveBatch(ctx context.Context, a Account, token string, box *Mailbox, jobID int64, records []incomingMessage, cursor uint32, history, done bool) error {
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, current Account) error {
		var enabled bool
		if err := tx.Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", a.UserID).Scan(&enabled).Error; err != nil {
			return err
		}
		for _, record := range records {
			m := record.Message
			m.Record = newRecord(a.UserID)
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
				attachment.Record = newRecord(a.UserID)
				attachment.MessageID = m.ID
				if err := tx.Create(&attachment).Error; err != nil {
					return err
				}
			}
			if !history && current.NotifyEnabled {
				notification := Notification{Record: newRecord(a.UserID), MessageID: m.ID}
				if err := tx.Create(&notification).Error; err != nil {
					return err
				}
				if enabled {
					var subscriptions []PushSubscription
					if err := tx.Where("user_id = ? AND enabled", a.UserID).Find(&subscriptions).Error; err != nil {
						return err
					}
					for _, subscription := range subscriptions {
						delivery := PushDelivery{Record: newRecord(a.UserID), NotificationID: notification.ID, SubscriptionID: subscription.ID, Status: "queued", NextRetryAt: time.Now().UTC()}
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
		if err := tx.Model(&Mailbox{}).Where("id = ? AND uid_validity = ?", box.ID, box.UIDValidity).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&SyncJob{}).Where("id = ?", jobID).Updates(map[string]any{"processed_count": gorm.Expr("processed_count + ?", len(records)), "updated_at": time.Now().UTC()}).Error
	})
	if err == nil {
		if history {
			box.HistoryUID = cursor
			box.HistoryDone = done
		} else {
			box.LiveUID = cursor
		}
		r.changed(ctx, a.UserID)
	}
	return err
}
func (r *Repository) hasQueuedSync(ctx context.Context, id int64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&SyncJob{}).Where("account_id = ? AND status = 'queued'", id).Count(&count).Error
	return count > 0, err
}
