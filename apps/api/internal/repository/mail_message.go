package repository

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildto "github.com/devin/oh-my-workbench/api/internal/domain/dto/mail"
	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
)

type MailMessageView struct {
	MailMessage
	Attachments []MailAttachment `json:"attachments" gorm:"-"`
	TodoID      *int64           `json:"todoId,string,omitempty"`
}

type MailPage struct {
	Messages  []MailMessage `json:"messages"`
	Total     int64         `json:"total"`
	NextAfter string        `json:"nextAfter"`
}

type MailOverview struct {
	Accounts             []MailAccountView      `json:"accounts"`
	Messages             []MailMessage          `json:"messages"`
	Notifications        []MailNotificationView `json:"notifications"`
	NotificationCount    int64                  `json:"notificationCount"`
	Total                int64                  `json:"total"`
	Unread               int64                  `json:"unread"`
	LatestReceivedAt     *string                `json:"latestReceivedAt"`
	Daily                map[string]int64       `json:"daily"`
	NotificationsEnabled bool                   `json:"notificationsEnabled"`
}

type IncomingMail struct {
	Message     MailMessage
	Attachments []MailAttachment
}

type MailMessage struct {
	MailRecord
	AccountID         int64      `json:"accountId,string"`
	MailboxID         int64      `json:"-"`
	UIDValidity       uint32     `json:"-"`
	RemoteUID         uint32     `json:"-"`
	RFCMessageID      string     `json:"-"`
	Sender            string     `json:"sender"`
	Address           string     `json:"address"`
	Recipients        string     `gorm:"type:jsonb" json:"-"`
	Subject           string     `json:"subject"`
	Preview           string     `json:"preview"`
	BodyText          *string    `json:"body"`
	BodyFetchedAt     *time.Time `json:"-"`
	BodyHTML          *string    `json:"bodyHtml,omitempty"`
	BodyFormatVersion int        `json:"-"`
	ReceivedAt        time.Time  `json:"receivedAt"`
	SizeBytes         int64      `json:"size"`
	IsRead            bool       `json:"read"`
	IsStarred         bool       `json:"starred"`
	IsArchived        bool       `json:"archived"`
	AttachmentCount   int        `json:"attachmentCount"`
	Version           int        `json:"version"`
}

func (MailMessage) TableName() string { return "omw_mail_message" }

func (r *MailMessageRepository) Query(ctx context.Context, userID, accountID int64, input mailreq.MessagePageRequest, predicate clause.Expression) (MailPage, error) {
	result := MailPage{Messages: []MailMessage{}}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q := mailFilteredMessages(tx, userID, accountID, input, predicate)
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
			var anchor MailMessage
			err := tx.Select("id", "received_at", "subject").Where("user_id = ? AND id = ?", userID, input.AfterID).First(&anchor).Error
			if err != nil {
				return mailFound(err)
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
		if err := q.Select(mailListColumns).Order(order).Offset(offset).Limit(input.PageSize).Scan(&result.Messages).Error; err != nil {
			return err
		}
		if len(result.Messages) > 0 {
			result.NextAfter = strconv.FormatInt(result.Messages[len(result.Messages)-1].ID, 10)
		}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *MailMessageRepository) Message(ctx context.Context, userID, id int64) (MailMessageView, error) {
	view := MailMessageView{Attachments: []MailAttachment{}}
	// Include the linked task ID so reading one mail never requires the task collection.
	if err := r.db.WithContext(ctx).Table("omw_mail_message m").Select("m.*,(SELECT t.id FROM omw_todo t WHERE t.user_id=m.user_id AND t.source_kind='mail' AND t.source_ref=m.id::text ORDER BY t.id LIMIT 1) AS todo_id").Where("m.user_id = ? AND m.id = ?", userID, id).Take(&view).Error; err != nil {
		return view, mailFound(err)
	}
	err := r.db.WithContext(ctx).Where("user_id = ? AND message_id = ?", userID, id).Order("id").Find(&view.Attachments).Error
	return view, err
}

func (r *MailMessageRepository) ChangeMessage(ctx context.Context, userID, id int64, input mailreq.UpdateMessageRequest) (MailMessage, error) {
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
	result := r.db.WithContext(ctx).Model(&MailMessage{}).Where("user_id = ? AND id = ? AND version = ?", userID, id, input.Version).Updates(changes)
	if result.Error != nil {
		return MailMessage{}, result.Error
	}
	if result.RowsAffected == 0 {
		var count int64
		if err := r.db.WithContext(ctx).Model(&MailMessage{}).Where("user_id = ? AND id = ?", userID, id).Count(&count).Error; err != nil {
			return MailMessage{}, err
		}
		if count == 0 {
			return MailMessage{}, maildomain.ErrNotFound
		}
		return MailMessage{}, maildomain.ErrConflict
	}
	var m MailMessage
	err := r.db.WithContext(ctx).Select("id", "account_id", "sender", "address", "subject", "preview", "received_at", "size_bytes", "is_read", "is_starred", "is_archived", "attachment_count", "version", "created_at", "updated_at").Where("user_id = ? AND id = ?", userID, id).First(&m).Error
	return m, err
}

// saveBatch commits content, notification outbox and cursor together; replays are harmless.
func (r *MailMessageRepository) SaveBatch(ctx context.Context, a MailAccount, token string, box *MailMailbox, jobID int64, records []IncomingMail, cursor uint32, history, done bool) error {
	err := r.MailAccount.leased(ctx, a.ID, token, func(tx *gorm.DB, current MailAccount) error {
		var enabled bool
		if err := tx.Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", a.UserID).Scan(&enabled).Error; err != nil {
			return err
		}
		for _, record := range records {
			m := record.Message
			m.MailRecord = NewMailRecord(a.UserID)
			m.AccountID = a.ID
			m.MailboxID = box.ID
			m.UIDValidity = box.UIDValidity
			m.Version = 1
			m.AttachmentCount = len(record.Attachments)
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&m)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue
			}
			for _, attachment := range record.Attachments {
				attachment.MailRecord = NewMailRecord(a.UserID)
				attachment.MessageID = m.ID
				if err := tx.Create(&attachment).Error; err != nil {
					return err
				}
			}
			if !history && current.NotifyEnabled {
				notification := MailNotification{MailRecord: NewMailRecord(a.UserID), MessageID: m.ID}
				if err := tx.Create(&notification).Error; err != nil {
					return err
				}
				if enabled {
					var subscriptions []PushSubscription
					if err := tx.Where("user_id = ? AND enabled", a.UserID).Find(&subscriptions).Error; err != nil {
						return err
					}
					for _, subscription := range subscriptions {
						delivery := MailPushDelivery{MailRecord: NewMailRecord(a.UserID), NotificationID: notification.ID, SubscriptionID: subscription.ID, Status: "queued", NextRetryAt: time.Now().UTC()}
						if err := tx.Create(&delivery).Error; err != nil {
							return err
						}
					}
				}
			}
		}
		changes := map[string]any{"updated_at": time.Now().UTC()}
		if history {
			changes["history_uid"] = cursor
			changes["history_done"] = done
		} else {
			changes["live_uid"] = cursor
		}
		if err := tx.Model(&MailMailbox{}).Where("id = ? AND uid_validity = ?", box.ID, box.UIDValidity).Updates(changes).Error; err != nil {
			return err
		}
		return tx.Model(&MailSyncJob{}).Where("id = ?", jobID).Updates(map[string]any{"processed_count": gorm.Expr("processed_count + ?", len(records)), "updated_at": time.Now().UTC()}).Error
	})
	if err == nil {
		if history {
			box.HistoryUID = cursor
			box.HistoryDone = done
		} else {
			box.LiveUID = cursor
		}
		r.MailEvents.Changed(ctx, a.UserID)
	}
	return err
}

// 通知、订阅和投递队列的事务与重试状态。
// overview aggregates complete counts while returning only a bounded header preview.
func (r *MailMessageRepository) Overview(ctx context.Context, userID int64) (MailOverview, error) {
	out := MailOverview{Messages: []MailMessage{}, Notifications: []MailNotificationView{}, Daily: map[string]int64{}}
	var err error
	out.Accounts, err = r.MailAccount.AccountViews(ctx, userID)
	if err != nil {
		return out, err
	}
	for _, a := range out.Accounts {
		out.Total += a.Total
		out.Unread += a.Unread
	}
	if err = mailCurrentMessages(r.db.WithContext(ctx), userID).Where("NOT m.is_archived").Select(mailListColumns).Order("m.received_at DESC,m.id DESC").Limit(100).Scan(&out.Messages).Error; err != nil {
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
	if err = mailCurrentMessages(r.db.WithContext(ctx), userID).Select("(m.received_at AT TIME ZONE 'Asia/Shanghai')::date AS day,count(*) AS count").Group("day").Scan(&days).Error; err != nil {
		return out, err
	}
	for _, day := range days {
		out.Daily[day.Day.Format(time.DateOnly)] = day.Count
	}
	out.Notifications, err = r.MailNotification.Notifications(ctx, userID, 0)
	if err != nil {
		return out, err
	}
	if err = r.db.WithContext(ctx).Model(&MailNotification{}).Where("user_id = ? AND read_at IS NULL", userID).Count(&out.NotificationCount).Error; err != nil {
		return out, err
	}
	err = r.db.WithContext(ctx).Table("omw_user").Select("mail_notifications_enabled").Where("id = ?", userID).Scan(&out.NotificationsEnabled).Error
	return out, err
}

// bulkMessages 使用一条参数化 UPDATE，避免取回 ID 列表和逐封请求。
func (r *MailMessageRepository) BulkMessages(ctx context.Context, userID, accountID int64, input mailreq.BulkMessagesRequest, predicate clause.Expression) (maildto.BulkResult, error) {
	db := r.db.WithContext(ctx)
	matches := mailFilteredMessages(db, userID, accountID, input.MessagePageRequest, predicate).Select("m.id")
	q := db.Model(&MailMessage{}).Where("user_id = ? AND id IN (?)", userID, matches)
	changes := map[string]any{"updated_at": time.Now().UTC(), "version": gorm.Expr("version + 1")}
	if input.Action == "read" {
		q = q.Where("NOT is_read")
		changes["is_read"] = true
	} else {
		q = q.Where("is_read AND NOT is_archived")
		changes["is_archived"] = true
	}
	result := q.Updates(changes)
	return maildto.BulkResult{Affected: result.RowsAffected}, result.Error
}

type MailMessageRepository struct{ *Store }
