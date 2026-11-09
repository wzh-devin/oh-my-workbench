package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
)

type MailMailbox struct {
	MailRecord
	AccountID            int64
	RemoteName           string
	UIDValidity          uint32
	NotificationBoundary uint32
	LiveUID              uint32
	HistoryUID           uint32
	HistoryDone          bool
}

func (MailMailbox) TableName() string { return "omw_mail_mailbox" }

func (r *MailMailboxRepository) PrepareMailbox(ctx context.Context, a MailAccount, token string, validity, ceiling uint32) (MailMailbox, error) {
	var box MailMailbox
	err := r.MailAccount.leased(ctx, a.ID, token, func(tx *gorm.DB, _ MailAccount) error {
		err := tx.Where("account_id = ? AND remote_name = 'INBOX'", a.ID).First(&box).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			box = MailMailbox{MailRecord: NewMailRecord(a.UserID), AccountID: a.ID, RemoteName: "INBOX", UIDValidity: validity, NotificationBoundary: ceiling, LiveUID: ceiling, HistoryDone: ceiling == 0}
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

type MailMailboxRepository struct{ *Store }
