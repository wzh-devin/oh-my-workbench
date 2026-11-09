package workbench

import "time"

type RecordResponse struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Kind      string    `json:"kind"`
	Source    string    `json:"source"`
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Href      string    `json:"href"`
	TodoID    *string   `json:"todoId,omitempty"`
	Version   int       `json:"version"`
}

type RecordPageResponse struct {
	Records []RecordResponse `json:"records"`
	Total   int64            `json:"total"`
}
