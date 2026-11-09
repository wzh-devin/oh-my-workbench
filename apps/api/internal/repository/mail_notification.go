package repository

import (
	"context"
	"time"
)

type MailNotificationView struct {
	MailNotification
	Subject string `json:"subject"`
	Sender  string `json:"sender"`
}

type MailNotification struct {
	MailRecord
	MessageID int64      `json:"messageId,string"`
	ReadAt    *time.Time `json:"readAt"`
}

func (MailNotification) TableName() string { return "omw_mail_notification" }

func (r *MailNotificationRepository) Notifications(ctx context.Context, userID, before int64) ([]MailNotificationView, error) {
	out := []MailNotificationView{}
	q := r.db.WithContext(ctx).Table("omw_mail_notification AS n").Select("n.*,m.subject,m.sender").
		Joins("JOIN omw_mail_message m ON m.id = n.message_id AND m.user_id = n.user_id").Where("n.user_id = ? AND n.read_at IS NULL", userID)
	if before > 0 {
		q = q.Where("n.id < ?", before)
	}
	err := q.Order("n.id DESC").Limit(100).Scan(&out).Error
	return out, err
}

func (r *MailNotificationRepository) ReadNotifications(ctx context.Context, userID int64, ids []int64, all bool) error {
	q := r.db.WithContext(ctx).Model(&MailNotification{}).Where("user_id = ? AND read_at IS NULL", userID)
	if !all {
		q = q.Where("id IN ?", ids)
	}
	return q.Updates(map[string]any{"read_at": time.Now().UTC(), "updated_at": time.Now().UTC()}).Error
}

type MailNotificationRepository struct{ *Store }
