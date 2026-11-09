package todos

import (
	"time"

	tododto "github.com/devin/oh-my-workbench/api/internal/domain/dto/todos"
)

type StepResponse struct {
	ID    int64  `json:"id,string"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

type TaskResponse struct {
	ID          int64           `json:"id,string"`
	ListID      *int64          `json:"listId,string"`
	Title       string          `json:"title"`
	Note        string          `json:"note"`
	Done        bool            `json:"done"`
	Priority    int             `json:"priority"`
	DueDate     *string         `json:"dueDate"`
	PlannedFor  *string         `json:"plannedFor"`
	CompletedAt *time.Time      `json:"completedAt"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
	Tags        []string        `json:"tags"`
	Steps       []StepResponse  `json:"steps"`
	Source      *tododto.Source `json:"source"`
	Version     int             `json:"version"`
}

type TaskPageResponse struct {
	Records  []TaskResponse `json:"records"`
	Total    int64          `json:"total"`
	PageNum  int            `json:"pageNum"`
	PageSize int            `json:"pageSize"`
}
