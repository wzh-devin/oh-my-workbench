package mail

import "time"

type AccountResponse struct {
	RecordResponse
	Name          string     `json:"name"`
	Provider      string     `json:"provider"`
	Email         string     `json:"email"`
	Enabled       bool       `json:"enabled"`
	NotifyEnabled bool       `json:"notifyEnabled"`
	Version       int        `json:"version"`
	LastSyncAt    *time.Time `json:"lastSync"`
	LastError     *string    `json:"error"`
}

type AccountDetailResponse struct {
	AccountResponse
	Status  string `json:"status"`
	Unread  int64  `json:"unread"`
	Total   int64  `json:"total"`
	Host    string `json:"host"`
	Port    int    `json:"port"`
	TLS     bool   `json:"tls"`
	Syncing bool   `json:"syncing"`
}
