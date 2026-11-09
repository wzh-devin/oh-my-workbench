package repository

import (
	"context"
	"time"

	maildto "github.com/devin/oh-my-workbench/api/internal/domain/dto/mail"
	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

func (r *MailBodyRepository) CacheBody(ctx context.Context, userID, id int64, body maildto.MessageBody) error {
	return r.db.WithContext(ctx).Model(&MailMessage{}).Where("user_id = ? AND id = ? AND body_format_version < ?", userID, id, maildomain.BodyFormatVersion).
		Updates(map[string]any{"body_text": body.Text, "body_html": body.HTML, "body_format_version": maildomain.BodyFormatVersion, "body_fetched_at": time.Now().UTC(), "preview": maildomain.Preview(body.Text), "updated_at": time.Now().UTC()}).Error
}

type MailBodyRepository struct{ *Store }
