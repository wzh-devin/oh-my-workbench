package todos

import "encoding/json"

type StepRequest struct {
	ID    string `json:"id,omitempty"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

type TaskRequest struct {
	ID         string          `json:"id,omitempty"`
	Version    int             `json:"version"`
	ListID     json.RawMessage `json:"listId"`
	Title      *string         `json:"title"`
	Note       *string         `json:"note"`
	Done       *bool           `json:"done"`
	Priority   *int            `json:"priority"`
	DueDate    json.RawMessage `json:"dueDate"`
	PlannedFor json.RawMessage `json:"plannedFor"`
	Tags       *[]string       `json:"tags"`
	Steps      *[]StepRequest  `json:"steps"`
	Source     json.RawMessage `json:"source"`
}

type DeleteRequest struct {
	Version int `json:"version"`
}
