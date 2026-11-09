package todos

import (
	"time"

	tododto "github.com/devin/oh-my-workbench/api/internal/domain/dto/todos"
)

type ImportTaskRequest struct {
	ID          string          `json:"id"`
	ListID      string          `json:"listId"`
	Title       string          `json:"title"`
	Note        string          `json:"note"`
	Done        bool            `json:"done"`
	Priority    int             `json:"priority"`
	DueDate     *string         `json:"dueDate"`
	PlannedFor  *string         `json:"plannedFor"`
	CompletedAt *time.Time      `json:"completedAt"`
	CreatedAt   time.Time       `json:"createdAt"`
	Tags        []string        `json:"tags"`
	Steps       []StepRequest   `json:"steps"`
	Source      *tododto.Source `json:"source"`
}

type ImportRequest struct {
	Lists []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"todoLists"`
	Tasks []ImportTaskRequest `json:"todos"`
}
