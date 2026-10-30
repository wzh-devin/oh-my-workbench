// 通知、订阅和投递队列的事务与重试状态。
package mail

import (
	"context"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// overview aggregates complete counts while returning only a bounded header preview.
func (r *Repository) overview(ctx context.Context, userID int64) (Overview, error) {
	out := Overview{Messages: []Message{}, Notifications: []NotificationView{}, Daily: map[string]int64{}}
	var err error
	out.Accounts, err = r.accountViews(ctx, userID)
	if err != nil {
		return out, err
	}
	for _, a := range out.Accounts {
		out.Total += a.Total
		out.Unread += a.Unread
	}
	if err = currentMessages(r.db.WithContext(ctx), userID).Where("NOT m.is_archived").Select(listColumns).Order("m.received_at DESC,m.id DESC").Limit(100).Scan(&out.Messages).Error; err != nil {
		return out, err
	}
	if len(out.Messages) > 0 {
		value := out.Messages[0].ReceivedAt.Format(time.RFC3339)
		out.LatestReceivedAt = &value
	}
	var days []struct {
		Day   time.Time
		Count int64
	}
	if err = currentMessages(r.db.WithContext(ctx), userID).Select("(m.received_at AT TIME ZONE 'Asia/Shanghai')::date AS day,count(*) AS count").Group("day").Scan(&days).Error; err != nil {
		return out, err
	}
	for _, day := range days {
		out.Daily[day.Day.Format(time.DateOnly)] = day.Count
	}
	out.Notifications, err = r.notifications(ctx, userID, 0)
	if err != nil {
		return out, err
	}
	if err = r.db.WithContext(ctx).Model(&Notification{}).Where("user_id = ? AND read_at IS NULL", userID).Count(&out.NotificationCount).Error; err != nil {
		return out, err
	}
	err = r.db.WithContext(ctx).Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", userID).Scan(&out.NotificationsEnabled).Error
	return out, err
}
func (r *Repository) notifications(ctx context.Context, userID, before int64) ([]NotificationView, error) {
	out := []NotificationView{}
	q := r.db.WithContext(ctx).Table("omw_mail_notification AS n").Select("n.*,m.subject,m.sender").
		Joins("JOIN omw_mail_message m ON m.id = n.message_id AND m.user_id = n.user_id").Where("n.user_id = ?", userID)
	if before > 0 {
		q = q.Where("n.id < ?", before)
	}
	err := q.Order("n.id DESC").Limit(100).Scan(&out).Error
	return out, err
}
func (r *Repository) readNotifications(ctx context.Context, userID int64, ids []int64, all bool) error {
	q := r.db.WithContext(ctx).Model(&Notification{}).Where("user_id = ? AND read_at IS NULL", userID)
	if !all {
		q = q.Where("id IN ?", ids)
	}
	return q.Updates(map[string]any{"read_at": time.Now().UTC(), "updated_at": time.Now().UTC()}).Error
}
func (r *Repository) setNotifications(ctx context.Context, userID int64, enabled bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("omw_user").Where("id = ?", userID).Update("mail_notifications_enabled", enabled).Error; err != nil {
			return err
		}
		if !enabled {
			return tx.Model(&PushDelivery{}).Where("user_id = ? AND status IN ?", userID, []string{"queued", "running"}).Updates(map[string]any{"status": "canceled", "lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
		}
		return nil
	})
}

// saveSubscription transfers the same browser only when its existing encryption keys match.
func (r *Repository) saveSubscription(ctx context.Context, s PushSubscription) error {
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
				return ErrInvalid
			}
			if old.UserID != s.UserID {
				if err := tx.Model(&PushDelivery{}).Where("subscription_id = ? AND status IN ?", old.ID, []string{"queued", "running"}).Update("status", "canceled").Error; err != nil {
					return err
				}
			}
			return tx.Model(&old).Updates(map[string]any{"user_id": s.UserID, "enabled": true, "updated_at": time.Now().UTC()}).Error
		}
		s.Record = newRecord(s.UserID)
		s.Enabled = true
		return tx.Create(&s).Error
	})
}
func (r *Repository) removeSubscription(ctx context.Context, userID int64, endpoint string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var subscriptions []PushSubscription
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("user_id = ? AND endpoint = ?", userID, endpoint).Find(&subscriptions).Error; err != nil {
			return err
		}
		for _, s := range subscriptions {
			if err := tx.Model(&s).Updates(map[string]any{"enabled": false, "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			if err := tx.Model(&PushDelivery{}).Where("subscription_id = ? AND status IN ?", s.ID, []string{"queued", "running"}).Update("status", "canceled").Error; err != nil {
				return err
			}
		}
		return nil
	})
}

type deliveryPayload struct {
	PushDelivery
	Endpoint  string
	PublicKey string
	Auth      string
	MessageID int64
}

func (r *Repository) claimDelivery(ctx context.Context, token string) (*deliveryPayload, error) {
	var payload deliveryPayload
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		var d PushDelivery
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
		var n Notification
		if err := tx.Where("id = ?", d.NotificationID).First(&n).Error; err != nil {
			return err
		}
		var enabled bool
		if err := tx.Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", d.UserID).Scan(&enabled).Error; err != nil {
			return err
		}
		if !enabled || !s.Enabled || s.UserID != d.UserID || n.ReadAt != nil {
			payload.PushDelivery = d
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
		payload = deliveryPayload{PushDelivery: d, Endpoint: s.Endpoint, PublicKey: s.PublicKey, Auth: s.Auth, MessageID: n.MessageID}
		return nil
	})
	if payload.ID == 0 {
		return nil, err
	}
	return &payload, err
}
func (r *Repository) finishDelivery(ctx context.Context, d deliveryPayload, token string, status int, sendErr error) error {
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
		return tx.Model(&PushDelivery{}).Where("id = ? AND status = 'running' AND lease_token = ?", d.ID, token).Updates(changes).Error
	})
}
