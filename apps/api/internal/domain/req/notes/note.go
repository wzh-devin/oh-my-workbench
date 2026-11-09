package notes

import "encoding/json"

type SaveNoteRequest struct {
	ID             string   `json:"id"`
	NotebookID     *string  `json:"notebookId"`
	Title          string   `json:"title"`
	Tags           []string `json:"tags"`
	Markdown       string   `json:"markdown"`
	RequiresUnlock bool     `json:"requiresUnlock"`
	Favorite       bool     `json:"favorite"`
	DiaryDate      *string  `json:"diaryDate"`
	Version        int      `json:"version"`
	RequestID      string   `json:"requestId"`
}

type NotePageRequest struct {
	ViewID      string          `json:"viewId"`
	Sort        string          `json:"sort"`
	SavedRule   json.RawMessage `json:"-"`
	PageNum     int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	Scope       string          `json:"scope"`
	NotebookID  string          `json:"notebookId"`
	Search      string          `json:"search"`
	FilterQuery json.RawMessage `json:"filterQuery"`
}
