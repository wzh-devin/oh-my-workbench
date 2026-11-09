package notes

import "time"

type RevisionResponse struct {
	ID          string    `json:"id"`
	NoteVersion int       `json:"noteVersion"`
	CreatedAt   time.Time `json:"createdAt"`
	Markdown    *string   `json:"markdown,omitempty"`
}
