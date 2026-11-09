package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

type MailAccountView struct {
	MailAccount
	Status  string `json:"status"`
	Unread  int64  `json:"unread"`
	Total   int64  `json:"total"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
	TLS     bool   `json:"tls"`
	Syncing bool   `json:"syncing"`
}

type MailAccount struct {
	MailRecord
	Name                 string     `json:"name"`
	Provider             string     `json:"provider"`
	Email                string     `json:"email"`
	CredentialCiphertext []byte     `json:"-"`
	Enabled              bool       `json:"enabled"`
	NotifyEnabled        bool       `json:"notifyEnabled"`
	Version              int        `json:"version"`
	LastSyncAt           *time.Time `json:"lastSync"`
	LastError            *string    `json:"error"`
	LeaseToken           *string    `json:"-"`
	LeaseUntil           *time.Time `json:"-"`
}

func (MailAccount) TableName() string { return "omw_mail_account" }

func (r *MailAccountRepository) Account(ctx context.Context, userID, id int64) (MailAccount, error) {
	var a MailAccount
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&a).Error
	return a, mailFound(err)
}

// SaveAccount invalidates the listener before publishing changed credentials or pause state.
func (r *MailAccountRepository) SaveAccount(ctx context.Context, account MailAccount, create bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var lock struct{ ID int64 }
		if err := tx.Table("omw_user").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", account.UserID).First(&lock).Error; err != nil {
			return err
		}
		if create {
			var count int64
			if err := tx.Model(&MailAccount{}).Where("user_id = ?", account.UserID).Count(&count).Error; err != nil {
				return err
			}
			if count >= 20 {
				return maildomain.ErrInvalid
			}
			var duplicate int64
			if err := tx.Model(&MailAccount{}).Where("user_id = ? AND lower(email) = lower(?)", account.UserID, account.Email).Count(&duplicate).Error; err != nil {
				return err
			}
			if duplicate != 0 {
				return maildomain.ErrDuplicate
			}
			if err := tx.Create(&account).Error; err != nil {
				return err
			}
		} else {
			result := tx.Model(&MailAccount{}).Where("id = ? AND user_id = ? AND version = ?", account.ID, account.UserID, account.Version).
				Updates(map[string]any{"name": account.Name, "credential_ciphertext": account.CredentialCiphertext, "enabled": account.Enabled,
					"notify_enabled": account.NotifyEnabled, "version": account.Version + 1, "lease_token": nil, "lease_until": nil,
					"last_error": nil, "updated_at": time.Now().UTC()})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				return maildomain.ErrConflict
			}
		}
		return tx.Model(&MailSyncJob{}).Where("account_id = ? AND status IN ?", account.ID, []string{"queued", "running"}).
			Updates(map[string]any{"status": "canceled", "finished_at": time.Now().UTC(), "updated_at": time.Now().UTC()}).Error
	})
}

func (r *MailAccountRepository) AccountViews(ctx context.Context, userID int64) ([]MailAccountView, error) {
	records := []MailAccountView{}
	err := r.db.WithContext(ctx).Table("omw_mail_account AS a").
		Select("a.*, COALESCE(c.total,0) AS total, COALESCE(c.unread,0) AS unread, EXISTS(SELECT 1 FROM omw_mail_sync_job j WHERE j.account_id = a.id AND j.status IN ('queued','running')) AS syncing").
		Joins("LEFT JOIN (SELECT m.account_id, count(*) FILTER (WHERE NOT m.is_archived) AS total, count(*) FILTER (WHERE NOT m.is_read AND NOT m.is_archived) AS unread FROM omw_mail_message m JOIN omw_mail_mailbox b ON b.id = m.mailbox_id AND b.uid_validity = m.uid_validity WHERE m.user_id = ? GROUP BY m.account_id) c ON c.account_id = a.id", userID).
		Where("a.user_id = ?", userID).Order("a.created_at, a.id").Scan(&records).Error
	return records, err
}

// 同步游标、任务和监听租约；事务阻止过期执行者写入。
func (r *MailAccountRepository) EnabledAccounts(ctx context.Context) ([]MailAccount, error) {
	records := []MailAccount{}
	err := r.db.WithContext(ctx).Where("enabled = true").Find(&records).Error
	return records, err
}

func (r *MailAccountRepository) ClaimListener(ctx context.Context, id int64, token string) (bool, error) {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&MailAccount{}).Where("id = ? AND enabled AND (lease_until IS NULL OR lease_until < ?)", id, now).
		Updates(map[string]any{"lease_token": token, "lease_until": now.Add(45 * time.Second)})
	return result.RowsAffected == 1, result.Error
}

func (r *MailAccountRepository) RenewListener(ctx context.Context, a MailAccount, token string) error {
	result := r.db.WithContext(ctx).Model(&MailAccount{}).
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
func (r *MailAccountRepository) leased(ctx context.Context, id int64, token string, work func(*gorm.DB, MailAccount) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var a MailAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&a).Error; err != nil {
			return err
		}
		if !a.Enabled || a.LeaseToken == nil || *a.LeaseToken != token || a.LeaseUntil == nil || !a.LeaseUntil.After(time.Now()) {
			return maildomain.ErrLease
		}
		return work(tx, a)
	})
}

func (r *MailAccountRepository) ReleaseListener(ctx context.Context, id int64, token string) error {
	return r.db.WithContext(ctx).Model(&MailAccount{}).Where("id = ? AND lease_token = ?", id, token).
		Updates(map[string]any{"lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
}

func (r *MailAccountRepository) ListenerError(ctx context.Context, a MailAccount, token, reason string) {
	_ = r.db.WithContext(ctx).Model(&MailAccount{}).Where("id = ? AND lease_token = ?", a.ID, token).
		Updates(map[string]any{"last_error": reason, "updated_at": time.Now().UTC()}).Error
	r.MailEvents.Changed(ctx, a.UserID)
}

func (r *MailAccountRepository) BeginSync(ctx context.Context, a MailAccount, token, trigger string) (MailSyncJob, error) {
	var job MailSyncJob
	err := r.leased(ctx, a.ID, token, func(tx *gorm.DB, _ MailAccount) error {
		err := tx.Where("account_id = ? AND status IN ?", a.ID, []string{"queued", "running"}).First(&job).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			job = MailSyncJob{MailRecord: NewMailRecord(a.UserID), AccountID: a.ID, Trigger: trigger, Status: "queued"}
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

type MailAccountRepository struct{ *Store }
