package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"gorm.io/gorm"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	workbenchreq "github.com/devin/oh-my-workbench/api/internal/domain/req/workbench"
	workbenchresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/workbench"
	workbenchdomain "github.com/devin/oh-my-workbench/api/internal/domain/workbench"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

func (r *WorkbenchQueries) Statistics(ctx context.Context, userID int64) (workbenchresp.StatisticsResponse, error) {
	out := workbenchresp.StatisticsResponse{Todos: workbenchresp.TodoStatsResponse{Daily: map[string]int64{}}, Mail: workbenchresp.MailStatsResponse{Daily: map[string]int64{}}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		type dayCount struct {
			Day            *string
			Total, Pending int64
		}
		var days []dayCount
		if e := db.Raw(`SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,count(*) total,count(*) FILTER(WHERE NOT done) pending FROM omw_todo WHERE user_id=? GROUP BY GROUPING SETS((),(day))`, userID).Scan(&days).Error; e != nil {
			return e
		}
		for _, v := range days {
			if v.Day == nil {
				out.Todos.Total = v.Total
				out.Todos.Pending = v.Pending
			} else {
				out.Todos.Daily[*v.Day] = v.Total
			}
		}
		if e := db.Table("omw_todo_list").Where("user_id=?", userID).Count(&out.Todos.ListCount).Error; e != nil {
			return e
		}
		out.Todos.ListCount++
		days = nil
		if e := db.Raw(`SELECT to_char(m.received_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,count(*) FILTER(WHERE NOT m.is_archived) total,count(*) FILTER(WHERE NOT m.is_archived AND NOT m.is_read) pending`+workbenchCurrentMail+`WHERE m.user_id=? GROUP BY GROUPING SETS((),(day))`, userID).Scan(&days).Error; e != nil {
			return e
		}
		for _, v := range days {
			if v.Day == nil {
				out.Mail.Total = v.Total
				out.Mail.Unread = v.Pending
			} else {
				out.Mail.Daily[*v.Day] = v.Total
			}
		}
		if e := db.Table("omw_mail_account").Where("user_id=?", userID).Count(&out.Mail.AccountCount).Error; e != nil {
			return e
		}
		if e := db.Table("omw_asset_connection").Where("user_id=?", userID).Count(&out.StorageCount).Error; e != nil {
			return e
		}
		var healthy int64
		if e := db.Raw(`SELECT (SELECT count(*) FROM omw_mail_account WHERE user_id=? AND enabled AND COALESCE(last_error,'')='')+(SELECT count(*) FROM omw_asset_connection WHERE user_id=? AND enabled AND last_checked_at IS NOT NULL AND last_error='')`, userID, userID).Scan(&healthy).Error; e != nil {
			return e
		}
		out.Healthy = healthy
		out.ConnectionTotal = out.Mail.AccountCount + out.StorageCount
		a, e := New(db, nil).AssetEntry.Statistics(ctx, userID)
		out.Assets = a
		return e
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// Records跨模块UNION只投影列表列，由数据库稳定排序分页，文件仍复用回收可见性。
func (r *WorkbenchQueries) Records(ctx context.Context, userID int64, in workbenchreq.RecordPageRequest) (workbenchresp.RecordPageResponse, error) {
	out := workbenchresp.RecordPageResponse{Records: []workbenchresp.RecordResponse{}}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		query := AssetsHiddenEntriesCTE + "SELECT %s FROM (" + workbenchRecordUnion + ") records WHERE (?='all' OR kind=?) AND strpos(lower(title||' '||source),lower(?))>0"
		args := []any{userID, userID, userID, userID, userID, in.Kind, in.Kind, in.Search}
		if e := db.Raw(fmt.Sprintf(query, "count(*)"), args...).Scan(&out.Total).Error; e != nil {
			return e
		}
		order := map[string]string{"timestamp:desc": "timestamp DESC,id DESC", "timestamp:asc": "timestamp ASC,id ASC", "title:asc": "title ASC,id DESC", "title:desc": "title DESC,id DESC"}[in.Sort]
		if order == "" {
			return workbenchdomain.ErrInvalid
		}
		return db.Raw(fmt.Sprintf(query, "*")+" ORDER BY "+order+" LIMIT ? OFFSET ?", append(args, in.PageSize, (in.PageNum-1)*in.PageSize)...).Scan(&out.Records).Error
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// Issues只读取异常连接与三个待处理任务，供Dashboard待处理卡片使用。
func (r *WorkbenchQueries) Issues(ctx context.Context, userID int64) (workbenchresp.IssuesResponse, error) {
	out := workbenchresp.IssuesResponse{Connections: []workbenchresp.ConnectionIssueResponse{}, Pending: []workbenchresp.PendingTaskResponse{}}
	e := r.db.WithContext(ctx).Raw(`SELECT id::text,name,email AS source,'/mail'||chr(63)||'view=accounts' AS href,'mail' AS kind FROM omw_mail_account WHERE user_id=? AND enabled AND COALESCE(last_error,'')<>'' UNION ALL SELECT id::text,name,bucket,'/assets'||chr(63)||'view=connections','storage' FROM omw_asset_connection WHERE user_id=? AND enabled AND (last_checked_at IS NULL OR last_error<>'') ORDER BY name,id`, userID, userID).Scan(&out.Connections).Error
	if e != nil {
		return out, e
	}
	page, e := New(r.db, nil).Todo.TaskPage(ctx, userID, todoreq.TaskPageRequest{PageNum: 1, PageSize: 3, Sort: "due"}, "NOT t.done", nil)
	if e != nil {
		return out, e
	}
	ids := []int64{}
	for _, v := range page.Records {
		if v.ListID != nil {
			ids = append(ids, *v.ListID)
		}
	}
	names := map[int64]string{}
	if len(ids) > 0 {
		var lists []TodoList
		if e = r.db.WithContext(ctx).Where("user_id=? AND id IN ?", userID, ids).Find(&lists).Error; e != nil {
			return out, e
		}
		for _, v := range lists {
			names[v.ID] = v.Name
		}
	}
	for _, v := range page.Records {
		name := "收集箱"
		if v.ListID != nil {
			name = names[*v.ListID]
		}
		out.Pending = append(out.Pending, workbenchresp.PendingTaskResponse{TaskResponse: v, ListName: name})
	}
	return out, nil
}

func (r *WorkbenchQueries) Notifications(ctx context.Context, userID int64, in workbenchreq.RecordPageRequest) (workbenchresp.NotificationPageResponse, error) {
	out := workbenchresp.NotificationPageResponse{Records: []workbenchresp.NotificationResponse{}}
	readIDs, _ := json.Marshal(in.ReadIDs)
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		query := "SELECT %s FROM (" + workbenchNoticeUnion + ") notices WHERE kind IN ? AND id NOT IN(SELECT jsonb_array_elements_text(?::jsonb)) AND timestamp>COALESCE((SELECT NULLIF(convert_from(value,'UTF8')::jsonb->>notices.kind,'')::timestamptz FROM omw_system_setting WHERE user_id=? AND key='notifications.readAll'),'-infinity'::timestamptz)"
		args := []any{userID, userID, userID, userID, in.Kinds, string(readIDs), userID}
		if e := db.Raw(fmt.Sprintf(query, "count(*)"), args...).Scan(&out.Total).Error; e != nil {
			return e
		}
		if e := db.Raw(fmt.Sprintf(query, "id,kind,title,body,href,TRUE AS unread")+" ORDER BY timestamp DESC,id DESC LIMIT ? OFFSET ?", append(args, in.PageSize, (in.PageNum-1)*in.PageSize)...).Scan(&out.Records).Error; e != nil {
			return e
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// ReadAll在用户锁内记录各类通知的已读界限；邮件回执同步持久化，不读取通知全集。
func (r *WorkbenchQueries) ReadAll(ctx context.Context, userID int64, kinds []string) error {
	return r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		var owner int64
		if e := db.Raw("SELECT id FROM omw_user WHERE id=? FOR UPDATE", userID).Scan(&owner).Error; e != nil {
			return e
		}
		if owner == 0 {
			return workbenchdomain.ErrInvalid
		}
		now := time.Now().UTC()
		record := SystemSetting{}
		e := db.Where("user_id=? AND key=?", userID, "notifications.readAll").First(&record).Error
		values := map[string]string{}
		if e == nil {
			if json.Unmarshal(record.Value, &values) != nil {
				return workbenchdomain.ErrInvalid
			}
		} else if e == gorm.ErrRecordNotFound {
			record = SystemSetting{ID: idgen.Next(), UserID: userID, Key: "notifications.readAll", CreatedAt: now}
		} else {
			return e
		}
		for _, kind := range kinds {
			values[kind] = now.Format(time.RFC3339Nano)
			if kind == "mail" {
				if e := db.Exec("UPDATE omw_mail_notification SET read_at=?,updated_at=? WHERE user_id=? AND read_at IS NULL", now, now, userID).Error; e != nil {
					return e
				}
			}
		}
		raw, e := json.Marshal(values)
		if e != nil {
			return e
		}
		record.Value = raw
		record.Version++
		record.UpdatedAt = now
		return db.Save(&record).Error
	})
}

type WorkbenchQueries struct{ *Store }

const workbenchCurrentMail = ` FROM omw_mail_message m JOIN omw_mail_mailbox mb ON mb.id=m.mailbox_id AND mb.user_id=m.user_id AND mb.uid_validity=m.uid_validity `

const workbenchRecordUnion = `SELECT 'todo-'||t.id AS id,t.title,'todo' AS kind,COALESCE(l.name,'收集箱') AS source,CASE WHEN t.done THEN '已完成' ELSE '待完成' END AS status,t.created_at AS timestamp,'/todos'||chr(63)||'task='||t.id AS href,t.id::text AS todo_id,t.version FROM omw_todo t LEFT JOIN omw_todo_list l ON l.id=t.list_id AND l.user_id=t.user_id WHERE t.user_id=?
 UNION ALL SELECT 'mail-'||m.id,m.subject,'mail',a.name,CASE WHEN m.is_read THEN '已读' ELSE '未读' END,m.received_at,'/mail'||chr(63)||'message='||m.id,NULL, m.version` + workbenchCurrentMail + `JOIN omw_mail_account a ON a.id=m.account_id AND a.user_id=m.user_id WHERE m.user_id=? AND NOT m.is_archived
 UNION ALL SELECT 'asset-'||e.id,e.name,'asset',c.name,'已保存',e.created_at,'/assets'||chr(63)||'connection='||e.connection_id||'&file='||e.id||CASE WHEN e.parent_id IS NULL THEN '' ELSE '&folder='||e.parent_id END,NULL,e.version FROM omw_asset_entry e JOIN omw_asset_connection c ON c.id=e.connection_id AND c.user_id=e.user_id WHERE e.user_id=? AND e.kind='file' AND e.status='ready' AND e.id NOT IN(SELECT id FROM hidden)`

const workbenchNoticeUnion = `SELECT 'todo:'||t.id||':'||to_char(t.due_date,'YYYY-MM-DD')||CASE WHEN t.due_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date THEN ':overdue' ELSE ':today' END AS id,'todos' AS kind,CASE WHEN t.due_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date THEN '待办已逾期' ELSE '待办今日到期' END AS title,t.title AS body,'/todos'||chr(63)||'task='||t.id AS href,GREATEST(t.updated_at,(t.due_date+CASE WHEN t.due_date<(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date THEN INTERVAL '1 day' ELSE INTERVAL '0 day' END) AT TIME ZONE 'Asia/Shanghai') AS timestamp FROM omw_todo t WHERE t.user_id=? AND NOT t.done AND t.due_date<=(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date
 UNION ALL SELECT 'mail-notice:'||n.id,'mail','收到邮件',m.subject,'/mail'||chr(63)||'message='||m.id,n.created_at FROM omw_mail_notification n JOIN omw_mail_message m ON m.id=n.message_id AND m.user_id=n.user_id JOIN omw_mail_mailbox mb ON mb.id=m.mailbox_id AND mb.user_id=m.user_id AND mb.uid_validity=m.uid_validity JOIN omw_user u ON u.id=n.user_id WHERE n.user_id=? AND n.read_at IS NULL AND u.mail_notifications_enabled
 UNION ALL SELECT 'connection:mail:'||id||':'||version,'connections','邮箱连接异常',name,'/mail'||chr(63)||'view=accounts',updated_at FROM omw_mail_account WHERE user_id=? AND enabled AND COALESCE(last_error,'')<>''
 UNION ALL SELECT 'connection:storage:'||id||':'||version,'connections','存储连接异常',name,'/assets'||chr(63)||'view=connections',updated_at FROM omw_asset_connection WHERE user_id=? AND enabled AND (last_checked_at IS NULL OR last_error<>'')`
