package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
)

// 邮箱账号、邮件列表和详情的持久化及用户隔离。
// Repository owns every SQL/Redis operation; services never receive a database handle.
type Repository struct {
	db    *gorm.DB
	redis *redis.Client
}

func NewRepository(db *gorm.DB, redis *redis.Client) *Repository {
	return &Repository{db: db, redis: redis}
}

func found(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return maildomain.ErrNotFound
	}
	return err
}

func (r *Repository) Account(ctx context.Context, userID, id int64) (maildomain.Account, error) {
	var a maildomain.Account
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&a).Error
	return a, found(err)
}

// SaveAccount invalidates the listener before publishing changed credentials or pause state.
func (r *Repository) SaveAccount(ctx context.Context, account maildomain.Account, create bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var lock struct{ ID int64 }
		if err := tx.Table("omw_user").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", account.UserID).First(&lock).Error; err != nil {
			return err
		}
		if create {
			var count int64
			if err := tx.Model(&maildomain.Account{}).Where("user_id = ?", account.UserID).Count(&count).Error; err != nil {
				return err
			}
			if count >= 20 {
				return maildomain.ErrInvalid
			}
			var duplicate int64
			if err := tx.Model(&maildomain.Account{}).Where("user_id = ? AND lower(email) = lower(?)", account.UserID, account.Email).Count(&duplicate).Error; err != nil {
				return err
			}
			if duplicate != 0 {
				return maildomain.ErrDuplicate
			}
			if err := tx.Create(&account).Error; err != nil {
				return err
			}
		} else {
			result := tx.Model(&maildomain.Account{}).Where("id = ? AND user_id = ? AND version = ?", account.ID, account.UserID, account.Version).
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
		return tx.Model(&maildomain.SyncJob{}).Where("account_id = ? AND status IN ?", account.ID, []string{"queued", "running"}).
			Updates(map[string]any{"status": "canceled", "finished_at": time.Now().UTC(), "updated_at": time.Now().UTC()}).Error
	})
}

func (r *Repository) AccountViews(ctx context.Context, userID int64) ([]maildomain.AccountView, error) {
	records := []maildomain.AccountView{}
	err := r.db.WithContext(ctx).Table("omw_mail_account AS a").
		Select("a.*, COALESCE(c.total,0) AS total, COALESCE(c.unread,0) AS unread, EXISTS(SELECT 1 FROM omw_mail_sync_job j WHERE j.account_id = a.id AND j.status IN ('queued','running')) AS syncing").
		Joins("LEFT JOIN (SELECT m.account_id, count(*) FILTER (WHERE NOT m.is_archived) AS total, count(*) FILTER (WHERE NOT m.is_read AND NOT m.is_archived) AS unread FROM omw_mail_message m JOIN omw_mail_mailbox b ON b.id = m.mailbox_id AND b.uid_validity = m.uid_validity WHERE m.user_id = ? GROUP BY m.account_id) c ON c.account_id = a.id", userID).
		Where("a.user_id = ?", userID).Order("a.created_at, a.id").Scan(&records).Error
	return records, err
}

const listColumns = "m.id,m.user_id,m.account_id,m.sender,m.address,m.subject,m.preview,m.received_at,m.size_bytes,m.is_read,m.is_starred,m.is_archived,m.attachment_count,m.version,m.created_at,m.updated_at"

func currentMessages(db *gorm.DB, userID int64) *gorm.DB {
	return db.Table("omw_mail_message AS m").
		Joins("JOIN omw_mail_mailbox b ON b.id = m.mailbox_id AND b.uid_validity = m.uid_validity").
		Where("m.user_id = ?", userID)
}

func (r *Repository) Query(ctx context.Context, userID, accountID int64, input maildomain.QueryInput, predicate clause.Expression) (maildomain.QueryResult, error) {
	result := maildomain.QueryResult{Messages: []maildomain.Message{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := filteredMessages(tx, userID, accountID, input, predicate)
		if err := q.Count(&result.Total).Error; err != nil {
			return err
		}
		order := "m.received_at DESC, m.id DESC"
		if input.Sort == "oldest" {
			order = "m.received_at ASC, m.id ASC"
		}
		if input.Sort == "subject" {
			order = "m.subject ASC, m.id DESC"
		}
		offset := (input.Page - 1) * input.PageSize
		if input.AfterID != "" {
			var anchor maildomain.Message
			err := tx.Select("id", "received_at", "subject").Where("user_id = ? AND id = ?", userID, input.AfterID).First(&anchor).Error
			if err != nil {
				return found(err)
			}
			// 相邻翻页走复合索引定位；直接跳页才使用 OFFSET。
			switch input.Sort {
			case "oldest":
				q = q.Where("(m.received_at,m.id) > (?,?)", anchor.ReceivedAt, anchor.ID)
			case "subject":
				q = q.Where("(m.subject > ? OR (m.subject = ? AND m.id < ?))", anchor.Subject, anchor.Subject, anchor.ID)
			default:
				q = q.Where("(m.received_at,m.id) < (?,?)", anchor.ReceivedAt, anchor.ID)
			}
			offset = 0
		}
		if err := q.Select(listColumns).Order(order).Offset(offset).Limit(input.PageSize).Scan(&result.Messages).Error; err != nil {
			return err
		}
		if len(result.Messages) > 0 {
			result.NextAfter = strconv.FormatInt(result.Messages[len(result.Messages)-1].ID, 10)
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *Repository) Message(ctx context.Context, userID, id int64) (maildomain.MessageView, error) {
	view := maildomain.MessageView{Attachments: []maildomain.Attachment{}}
	// Include the linked task ID so reading one mail never requires the task collection.
	if err := r.db.WithContext(ctx).Table("omw_mail_message m").Select("m.*,(SELECT t.id FROM omw_todo t WHERE t.user_id=m.user_id AND t.source_kind='mail' AND t.source_ref=m.id::text ORDER BY t.id LIMIT 1) AS todo_id").Where("m.user_id = ? AND m.id = ?", userID, id).Take(&view).Error; err != nil {
		return view, found(err)
	}
	err := r.db.WithContext(ctx).Where("user_id = ? AND message_id = ?", userID, id).Order("id").Find(&view.Attachments).Error
	return view, err
}

func (r *Repository) CacheBody(ctx context.Context, userID, id int64, body maildomain.MessageBody) error {
	return r.db.WithContext(ctx).Model(&maildomain.Message{}).Where("user_id = ? AND id = ? AND body_format_version < ?", userID, id, maildomain.BodyFormatVersion).
		Updates(map[string]any{"body_text": body.Text, "body_html": body.HTML, "body_format_version": maildomain.BodyFormatVersion, "body_fetched_at": time.Now().UTC(), "preview": maildomain.Preview(body.Text), "updated_at": time.Now().UTC()}).Error
}

func (r *Repository) ChangeMessage(ctx context.Context, userID, id int64, input maildomain.MessageChanges) (maildomain.Message, error) {
	changes := map[string]any{"version": input.Version + 1, "updated_at": time.Now().UTC()}
	if input.Read != nil {
		changes["is_read"] = *input.Read
	}
	if input.Starred != nil {
		changes["is_starred"] = *input.Starred
	}
	if input.Archived != nil {
		changes["is_archived"] = *input.Archived
	}
	result := r.db.WithContext(ctx).Model(&maildomain.Message{}).Where("user_id = ? AND id = ? AND version = ?", userID, id, input.Version).Updates(changes)
	if result.Error != nil {
		return maildomain.Message{}, result.Error
	}
	if result.RowsAffected == 0 {
		var count int64
		if err := r.db.WithContext(ctx).Model(&maildomain.Message{}).Where("user_id = ? AND id = ?", userID, id).Count(&count).Error; err != nil {
			return maildomain.Message{}, err
		}
		if count == 0 {
			return maildomain.Message{}, maildomain.ErrNotFound
		}
		return maildomain.Message{}, maildomain.ErrConflict
	}
	var m maildomain.Message
	err := r.db.WithContext(ctx).Select("id", "account_id", "sender", "address", "subject", "preview", "received_at", "size_bytes", "is_read", "is_starred", "is_archived", "attachment_count", "version", "created_at", "updated_at").Where("user_id = ? AND id = ?", userID, id).First(&m).Error
	return m, err
}

func (r *Repository) Attachment(ctx context.Context, userID, id int64) (maildomain.Attachment, error) {
	var a maildomain.Attachment
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&a).Error
	return a, found(err)
}

func (r *Repository) Job(ctx context.Context, userID, id int64) (maildomain.SyncJob, error) {
	var j maildomain.SyncJob
	err := r.db.WithContext(ctx).Where("user_id = ? AND id = ?", userID, id).First(&j).Error
	return j, found(err)
}

func (r *Repository) Enqueue(ctx context.Context, userID, id int64, trigger string) (maildomain.SyncJob, error) {
	var j maildomain.SyncJob
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var a maildomain.Account
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ? AND user_id = ?", id, userID).First(&a).Error; err != nil {
			return found(err)
		}
		if !a.Enabled {
			return maildomain.ErrInvalid
		}
		if err := tx.Where("account_id = ? AND status IN ?", id, []string{"queued", "running"}).First(&j).Error; err == nil {
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		j = maildomain.SyncJob{Record: maildomain.NewRecord(userID), AccountID: id, Trigger: trigger, Status: "queued"}
		return tx.Create(&j).Error
	})
	if err == nil {
		r.Changed(ctx, userID)
	}
	return j, err
}

// Changed is an invalidation hint; durable rows are the source of truth after reconnect.
func (r *Repository) Changed(ctx context.Context, userID int64) {
	if r.redis != nil {
		_ = r.redis.Publish(ctx, eventChannel(userID), "changed").Err()
	}
}

// Event 只作为通道数据使用，订阅读写和关闭仍由 Repository 管理。
type Event = redis.Message

func (r *Repository) Subscribe(ctx context.Context, userID int64) (<-chan *Event, func() error, error) {
	if r.redis == nil {
		return nil, nil, maildomain.ErrUnavailable
	}
	subscriber := r.redis.Subscribe(ctx, eventChannel(userID))
	if _, err := subscriber.Receive(ctx); err != nil {
		_ = subscriber.Close()
		return nil, nil, maildomain.ErrUnavailable
	}
	return subscriber.Channel(), subscriber.Close, nil
}

func (r *Repository) AllowConnection(ctx context.Context, userID int64) (bool, error) {
	if r.redis == nil {
		return true, nil
	}
	result, err := r.redis.Eval(ctx, `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`, []string{eventChannel(userID) + ":attempts"}).Int()
	return result <= 10, err
}

func eventChannel(userID int64) string { return fmt.Sprintf("mail:%d", userID) }
