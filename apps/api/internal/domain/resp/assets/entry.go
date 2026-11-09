package assets

import "time"

type EntryResponse struct {
	BaseResponse
	ConnectionID int64              `json:"connectionId,string"`
	ParentID     *string            `json:"parentId"`
	Kind         string             `json:"kind"`
	Name         string             `json:"name"`
	ContentType  string             `json:"type"`
	Starred      bool               `json:"starred"`
	LastOpenedAt *time.Time         `json:"lastOpenedAt"`
	TrashedAt    *time.Time         `json:"trashedAt"`
	Version      int                `json:"version"`
	LegacyID     *string            `json:"legacyId,omitempty"`
	Size         int64              `json:"size"`
	FileCount    *int64             `json:"fileCount,omitempty"`
	Hidden       bool               `json:"hidden,omitempty"`
	Origin       string             `json:"origin"`
	Thumbnail    *ThumbnailResponse `json:"thumbnail,omitempty"`
}

type EntryPageResponse struct {
	Entries    []EntryResponse `json:"entries"`
	Total      int64           `json:"total"`
	NextCursor string          `json:"nextCursor,omitempty"`
	HasMore    bool            `json:"hasMore"`
}
