package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

type MailSyncJob struct {
	MailRecord
	AccountID      int64      `json:"accountId,string"`
	Trigger        string     `json:"trigger"`
	Status         string     `json:"status"`
	ProcessedCount int        `json:"processedCount"`
	StartedAt      *time.Time `json:"startedAt"`
	FinishedAt     *time.Time `json:"finishedAt"`
	LastError      *string    `json:"error"`
}

func (MailSyncJob) TableName() string { return "omw_mail_sync_job" }

func (r *MailSyncJobRepository) Job(ctx context.Context, userID, id int64) (MailSyncJob, error) {
	var j MailSyncJob
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&j).Error
	return j, mailFound(err)
}

func (r *MailSyncJobRepository) Enqueue(ctx context.Context, userID, id int64, trigger string) (MailSyncJob, error) {
	var j MailSyncJob
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var a MailAccount
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", id, userID).First(&a).Error; err != nil {
			return mailFound(err)
		}
		if !a.Enabled {
			return maildomain.ErrInvalid
		}
		if err := tx.Where("account_id = ? AND status IN ?", id, []string{"queued", "running"}).First(&j).Error; err == nil {
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		j = MailSyncJob{MailRecord: NewMailRecord(userID), AccountID: id, Trigger: trigger, Status: "queued"}
		return tx.Create(&j).Error
	})
	if err == nil {
		r.MailEvents.Changed(ctx, userID)
	}
	return j, err
}

func (r *MailSyncJobRepository) FinishSync(ctx context.Context, a MailAccount, token string, job MailSyncJob, syncErr error) error {
	return r.MailAccount.leased(ctx, a.ID, token, func(tx *gorm.DB, _ MailAccount) error {
		now := time.Now().UTC()
		changes := map[string]any{"status": "succeeded", "finished_at": now, "updated_at": now}
		accountChanges := map[string]any{"last_sync_at": now, "last_error": nil, "updated_at": now}
		if syncErr != nil {
			changes["status"] = "failed"
			changes["last_error"] = maildomain.ErrUnavailable.Error()
			accountChanges = map[string]any{"last_error": maildomain.ErrUnavailable.Error(), "updated_at": now}
		}
		if err := tx.Model(&MailSyncJob{}).Where("id = ? AND status = 'running'", job.ID).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&MailAccount{}).Where("id = ?", a.ID).Updates(accountChanges).Error
	})
}

func (r *MailSyncJobRepository) HasQueuedSync(ctx context.Context, id int64) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&MailSyncJob{}).Where("account_id = ? AND status = 'queued'", id).Count(&count).Error
	return count > 0, err
}

type MailSyncJobRepository struct{ *Store }
