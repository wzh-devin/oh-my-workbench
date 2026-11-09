package notes

import "time"

type NoteResponse struct {
	ID             string     `json:"id"`
	NotebookID     *string    `json:"notebookId"`
	Title          string     `json:"title"`
	Tags           []string   `json:"tags"`
	RequiresUnlock bool       `json:"requiresUnlock"`
	Favorite       bool       `json:"favorite"`
	DiaryDate      *string    `json:"diaryDate"`
	Version        int        `json:"version"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	DeletedAt      *time.Time `json:"deletedAt"`
	Markdown       *string    `json:"markdown,omitempty"`
	UnlockedUntil  *time.Time `json:"unlockedUntil,omitempty"`
}

type NotePageResponse struct {
	Records  []NoteResponse `json:"records"`
	Total    int64          `json:"total"`
	PageNum  int            `json:"pageNum"`
	PageSize int            `json:"pageSize"`
}
