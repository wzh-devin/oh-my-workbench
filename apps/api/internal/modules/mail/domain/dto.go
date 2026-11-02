package domain

import "encoding/json"

// 邮箱 HTTP 输入与输出契约；公开数据不包含授权凭证。
// AccountInput exposes editable fields; host, port and TLS are provider templates.
type AccountInput struct {
	ID            string `json:"id,omitempty"`
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	Email         string `json:"email"`
	Credential    string `json:"credential"`
	Enabled       *bool  `json:"enabled"`
	NotifyEnabled *bool  `json:"notifyEnabled"`
	Version       int    `json:"version"`
}

type AccountView struct {
	Account
	Status  string `json:"status"`
	Unread  int64  `json:"unread"`
	Total   int64  `json:"total"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
	TLS     bool   `json:"tls"`
	Syncing bool   `json:"syncing"`
}

type MessageView struct {
	Message
	Attachments []Attachment `json:"attachments" gorm:"-"`
	TodoID      *int64       `json:"todoId,string,omitempty"`
}

type QueryInput struct {
	AccountID   string          `json:"accountId"`
	SearchText  string          `json:"searchText"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Page        int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	Sort        string          `json:"sort"`
	Archived    bool            `json:"archived"`
	AfterID     string          `json:"afterId"`
}

type QueryResult struct {
	Messages  []Message `json:"messages"`
	Total     int64     `json:"total"`
	NextAfter string    `json:"nextAfter"`
}

type MessageChanges struct {
	ID       string `json:"id,omitempty"`
	Version  int    `json:"version"`
	Read     *bool  `json:"read"`
	Starred  *bool  `json:"starred"`
	Archived *bool  `json:"archived"`
}

type NotificationView struct {
	Notification
	Subject string `json:"subject"`
	Sender  string `json:"sender"`
}

type Overview struct {
	Accounts             []AccountView      `json:"accounts"`
	Messages             []Message          `json:"messages"`
	Notifications        []NotificationView `json:"notifications"`
	NotificationCount    int64              `json:"notificationCount"`
	Total                int64              `json:"total"`
	Unread               int64              `json:"unread"`
	LatestReceivedAt     *string            `json:"latestReceivedAt"`
	Daily                map[string]int64   `json:"daily"`
	NotificationsEnabled bool               `json:"notificationsEnabled"`
}

// 批量操作复用列表条件，作用于全部匹配记录而非当前页。
type BulkInput struct {
	QueryInput
	Action string `json:"action"`
}

type BulkResult struct {
	Affected int64 `json:"affected"`
}
