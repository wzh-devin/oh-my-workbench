package repository

import "context"

type MailAttachment struct {
	MailRecord
	MessageID   int64  `json:"-"`
	PartID      string `json:"-"`
	Filename    string `json:"name"`
	ContentType string `json:"contentType"`
	Encoding    string `json:"-"`
	Charset     string `json:"-"`
	SizeBytes   int64  `json:"size"`
}

func (MailAttachment) TableName() string { return "omw_mail_attachment" }

func (r *MailAttachmentRepository) Attachment(ctx context.Context, userID, id int64) (MailAttachment, error) {
	var a MailAttachment
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&a).Error
	return a, mailFound(err)
}

type MailAttachmentRepository struct{ *Store }
