package repository

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

type PushSubscription struct {
	MailRecord
	Endpoint  string `json:"endpoint"`
	PublicKey string `json:"-"`
	Auth      string `json:"-"`
	Enabled   bool   `json:"enabled"`
}

func (PushSubscription) TableName() string { return "omw_push_subscription" }

// saveSubscription transfers the same browser only when its existing encryption keys match.
func (r *PushSubscriptionRepository) SaveSubscription(ctx context.Context, s PushSubscription) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// The endpoint lock also covers first registration from two tabs before a row exists.
		if err := tx.Exec("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", s.Endpoint).Error; err != nil {
			return err
		}
		var old PushSubscription
		result := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("endpoint = ?", s.Endpoint).Find(&old)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			if old.PublicKey != s.PublicKey || old.Auth != s.Auth {
				return maildomain.ErrInvalid
			}
			if old.UserID != s.UserID {
				if err := tx.Model(&MailPushDelivery{}).Where("subscription_id = ? AND status IN ?", old.ID, []string{"queued", "running"}).Update("status", "canceled").Error; err != nil {
					return err
				}
			}
			return tx.Model(&old).Updates(map[string]any{"user_id": s.UserID, "enabled": true, "updated_at": time.Now().UTC()}).Error
		}
		s.MailRecord = NewMailRecord(s.UserID)
		s.Enabled = true
		return tx.Create(&s).Error
	})
}

func (r *PushSubscriptionRepository) RemoveSubscription(ctx context.Context, userID int64, endpoint string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var subscriptions []PushSubscription
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND endpoint = ?", userID, endpoint).Find(&subscriptions).Error; err != nil {
			return err
		}
		for _, s := range subscriptions {
			if err := tx.Model(&s).Updates(map[string]any{"enabled": false, "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			if err := tx.Model(&MailPushDelivery{}).Where("subscription_id = ? AND status IN ?", s.ID, []string{"queued", "running"}).Update("status", "canceled").Error; err != nil {
				return err
			}
		}
		return nil
	})
}

type PushSubscriptionRepository struct{ *Store }
