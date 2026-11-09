package repository

import (
	"errors"
	"fmt"

	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

func mailFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return maildomain.ErrNotFound
	}
	return err
}

const mailListColumns = "m.id,m.user_id,m.account_id,m.sender,m.address,m.subject,m.preview,m.received_at,m.size_bytes,m.is_read,m.is_starred,m.is_archived,m.attachment_count,m.version,m.created_at,m.updated_at"

func mailCurrentMessages(db *gorm.DB, userID int64) *gorm.DB {
	return db.Table("omw_mail_message AS m").
		Joins("JOIN omw_mail_mailbox b ON b.id = m.mailbox_id AND b.uid_validity = m.uid_validity").
		Where("m.user_id = ?", userID)
}

type MailEvent = redis.Message

func mailEventChannel(userID int64) string { return fmt.Sprintf("mail:%d", userID) }

type mailDeliveryPayload struct {
	MailPushDelivery
	Endpoint  string
	PublicKey string
	Auth      string
	MessageID int64
}
