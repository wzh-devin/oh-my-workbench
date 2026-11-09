package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type MailPushDelivery struct {
	MailRecord
	NotificationID int64
	SubscriptionID int64
	Status         string
	Attempts       int
	NextRetryAt    time.Time
	LeaseToken     *string
	LeaseUntil     *time.Time
	LastError      *string
}

func (MailPushDelivery) TableName() string { return "omw_mail_push_delivery" }

func (r *MailPushDeliveryRepository) ClaimDelivery(ctx context.Context, token string) (*mailDeliveryPayload, error) {
	var payload mailDeliveryPayload
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		var d MailPushDelivery
		result := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("(status = 'queued' AND next_retry_at <= ?) OR (status = 'running' AND lease_until < ?)", now, now).
			Order("next_retry_at,id").Limit(1).Find(&d)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return nil
		}
		var s PushSubscription
		if err := tx.Where("id = ?", d.SubscriptionID).First(&s).Error; err != nil {
			return err
		}
		var n MailNotification
		if err := tx.Where("id = ?", d.NotificationID).First(&n).Error; err != nil {
			return err
		}
		var enabled bool
		if err := tx.Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", d.UserID).Scan(&enabled).Error; err != nil {
			return err
		}
		if !enabled || !s.Enabled || s.UserID != d.UserID || n.ReadAt != nil {
			payload.MailPushDelivery = d
			payload.Status = "canceled"
			return tx.Model(&d).Update("status", "canceled").Error
		}
		d.Status = "running"
		d.Attempts++
		d.LeaseToken = &token
		until := now.Add(45 * time.Second)
		d.LeaseUntil = &until
		d.UpdatedAt = now
		if err := tx.Save(&d).Error; err != nil {
			return err
		}
		payload = mailDeliveryPayload{MailPushDelivery: d, Endpoint: s.Endpoint, PublicKey: s.PublicKey, Auth: s.Auth, MessageID: n.MessageID}
		return nil
	})
	if payload.ID == 0 {
		return nil, err
	}
	return &payload, err
}

func (r *MailPushDeliveryRepository) FinishDelivery(ctx context.Context, d mailDeliveryPayload, token string, status int, sendErr error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		changes := map[string]any{"status": "succeeded", "lease_token": nil, "lease_until": nil, "last_error": nil, "updated_at": now}
		if sendErr != nil || status < 200 || status >= 300 {
			changes["status"] = "queued"
			changes["last_error"] = "推送暂未送达"
			delay := time.Duration(1<<min(d.Attempts, 10)) * time.Second
			changes["next_retry_at"] = now.Add(delay)
			if d.Attempts >= 10 {
				changes["status"] = "failed"
			}
		}
		if status == 404 || status == 410 {
			if err := tx.Model(&PushSubscription{}).Where("id = ? AND user_id = ?", d.SubscriptionID, d.UserID).Updates(map[string]any{"enabled": false, "updated_at": now}).Error; err != nil {
				return err
			}
			changes["status"] = "canceled"
		}
		return tx.Model(&MailPushDelivery{}).Where("id = ? AND status = 'running' AND lease_token = ?", d.ID, token).Updates(changes).Error
	})
}

type MailPushDeliveryRepository struct{ *Store }
