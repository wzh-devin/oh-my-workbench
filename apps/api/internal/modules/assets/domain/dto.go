package domain

import (
	"encoding/json"
	"time"
)

// 资产 HTTP 契约，业务 ID 为字符串，更新携带版本，批量请求携带幂等标识。
type ImportEntry struct {
	LegacyID     string     `json:"legacyId"`
	Starred      bool       `json:"starred"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    *time.Time `json:"updatedAt"`
	LastOpenedAt *time.Time `json:"lastOpenedAt"`
	TrashedAt    *time.Time `json:"trashedAt"`
}

type ConnectionInput struct {
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	Bucket    string `json:"bucket"`
	Prefix    string `json:"prefix"`
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	Enabled   bool   `json:"enabled"`
	Version   int    `json:"version"`
}

type QueryInput struct {
	ConnectionID string          `json:"connectionId"`
	ParentID     *string         `json:"parentId"`
	ViewID       string          `json:"viewId"`
	Trash        bool            `json:"trash"`
	Search       string          `json:"search"`
	FilterQuery  json.RawMessage `json:"filterQuery"`
	Sort         string          `json:"sort"`
	Page         int             `json:"page"`
	PageSize     int             `json:"pageSize"`
	CursorMode   bool            `json:"cursorMode"`
	Cursor       string          `json:"cursor"`
}

type QueryResult struct {
	Entries    []Entry `json:"entries"`
	Total      int64   `json:"total"`
	NextCursor string  `json:"nextCursor,omitempty"`
	HasMore    bool    `json:"hasMore"`
}

type EntryInput struct {
	ConnectionID string  `json:"connectionId"`
	ParentID     *string `json:"parentId"`
	Name         *string `json:"name"`
	Starred      *bool   `json:"starred"`
	Opened       bool    `json:"opened"`
	Version      int     `json:"version"`
	LegacyID     *string `json:"legacyId"`
}

type BatchItem struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type BatchInput struct {
	Entries      []BatchItem `json:"entries"`
	Action       string      `json:"action"`
	ConnectionID string      `json:"connectionId"`
	ParentID     *string     `json:"parentId"`
	Starred      bool        `json:"starred"`
	RequestKey   string      `json:"requestKey"`
}

type ViewInput struct {
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}

type UploadInput struct {
	ConnectionID string  `json:"connectionId"`
	ParentID     *string `json:"parentId"`
	Name         string  `json:"name"`
	ContentType  string  `json:"type"`
	Size         int64   `json:"size"`
	SHA256       string  `json:"sha256"`
	RequestKey   string  `json:"requestKey"`
	LegacyID     *string `json:"legacyId"`
}

type ConnectionStats struct {
	ID    int64 `json:"id,string"`
	Total int64 `json:"total"`
	Size  int64 `json:"size"`
}

type Overview struct {
	Connections []Connection      `json:"connections"`
	Folders     []Entry           `json:"folders"`
	Recent      []Entry           `json:"recent"`
	Views       []View            `json:"views"`
	Total       int64             `json:"total"`
	Size        int64             `json:"size"`
	Images      int64             `json:"images"`
	Documents   int64             `json:"documents"`
	Daily       map[string]int64  `json:"daily"`
	Storage     []ConnectionStats `json:"storage"`
}

func ConnectionView(c Connection) Connection {
	c.Status = "error"
	if !c.Enabled {
		c.Status = "paused"
	} else if c.LastCheckedAt != nil && c.LastError == "" {
		c.Status = "connected"
	}
	return c
}
