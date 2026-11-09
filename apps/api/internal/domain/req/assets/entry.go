package assets

import "encoding/json"

type EntryPageRequest struct {
	ConnectionID string          `json:"connectionId"`
	ParentID     *string         `json:"parentId"`
	ViewID       string          `json:"viewId"`
	Trash        bool            `json:"trash"`
	Search       string          `json:"search"`
	FilterQuery  json.RawMessage `json:"filterQuery"`
	Sort         string          `json:"sort"`
	Page         int             `json:"pageNum"`
	PageSize     int             `json:"pageSize"`
	CursorMode   bool            `json:"cursorMode"`
	Cursor       string          `json:"cursor"`
}

type SaveEntryRequest struct {
	ID           string  `json:"id,omitempty"`
	ConnectionID string  `json:"connectionId"`
	ParentID     *string `json:"parentId"`
	Name         *string `json:"name"`
	Starred      *bool   `json:"starred"`
	Opened       bool    `json:"opened"`
	Version      int     `json:"version"`
	LegacyID     *string `json:"legacyId"`
}
