package domain

import (
	"encoding/json"
	"time"
)

type ListView struct {
	ID        int64     `json:"id,string"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Source struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

type StepInput struct {
	ID    string `json:"id,omitempty"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

type StepView struct {
	ID    int64  `json:"id,string"`
	Title string `json:"title"`
	Done  bool   `json:"done"`
}

type TaskView struct {
	ID          int64      `json:"id,string"`
	ListID      *int64     `json:"listId,string"`
	Title       string     `json:"title"`
	Note        string     `json:"note"`
	Done        bool       `json:"done"`
	Priority    int        `json:"priority"`
	DueDate     *string    `json:"dueDate"`
	PlannedFor  *string    `json:"plannedFor"`
	CompletedAt *time.Time `json:"completedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Tags        []string   `json:"tags"`
	Steps       []StepView `json:"steps"`
	Source      *Source    `json:"source"`
	Version     int        `json:"version"`
}

type Snapshot struct {
	Lists      []ListView     `json:"todoLists"`
	Tasks      []TaskView     `json:"todos"`
	Views      []ViewInfo     `json:"todoViews"`
	Priorities []PriorityInfo `json:"todoPriorities"`
}

// RawMessage 区分省略字段和显式 null，PATCH 清空日期和移动到收集箱共用此边界。
type TaskRequest struct {
	Version    int             `json:"version"`
	ListID     json.RawMessage `json:"listId"`
	Title      *string         `json:"title"`
	Note       *string         `json:"note"`
	Done       *bool           `json:"done"`
	Priority   *int            `json:"priority"`
	DueDate    json.RawMessage `json:"dueDate"`
	PlannedFor json.RawMessage `json:"plannedFor"`
	Tags       *[]string       `json:"tags"`
	Steps      *[]StepInput    `json:"steps"`
	Source     json.RawMessage `json:"source"`
}

type ListRequest struct {
	Name string `json:"name"`
}

type DeleteRequest struct {
	Version int `json:"version"`
}

type DeleteListResult struct {
	ID    int64      `json:"id,string"`
	Tasks []TaskView `json:"todos"`
}

type LegacyTask struct {
	ID          string      `json:"id"`
	ListID      string      `json:"listId"`
	Title       string      `json:"title"`
	Note        string      `json:"note"`
	Done        bool        `json:"done"`
	Priority    int         `json:"priority"`
	DueDate     *string     `json:"dueDate"`
	PlannedFor  *string     `json:"plannedFor"`
	CompletedAt *time.Time  `json:"completedAt"`
	CreatedAt   time.Time   `json:"createdAt"`
	Tags        []string    `json:"tags"`
	Steps       []StepInput `json:"steps"`
	Source      *Source     `json:"source"`
}

type ImportRequest struct {
	Lists []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"todoLists"`
	Tasks []LegacyTask `json:"todos"`
}

func dateText(value *time.Time) *string {
	if value == nil {
		return nil
	}
	text := value.Format(time.DateOnly)
	return &text
}

func ToListView(list List) ListView {
	return ListView{list.ID, list.Name, list.CreatedAt, list.UpdatedAt}
}

func ToTaskView(task Task, steps []Step) TaskView {
	result := TaskView{ID: task.ID, ListID: task.ListID, Title: task.Title, Note: task.Note, Done: task.Done, Priority: task.Priority, DueDate: dateText(task.DueDate), PlannedFor: dateText(task.PlannedFor), CompletedAt: task.CompletedAt, CreatedAt: task.CreatedAt, UpdatedAt: task.UpdatedAt, Tags: task.Tags, Steps: []StepView{}, Version: task.Version}
	if result.Tags == nil {
		result.Tags = []string{}
	}
	if task.SourceKind != nil && task.SourceRef != nil && task.SourceLabel != nil {
		result.Source = &Source{*task.SourceKind, *task.SourceRef, *task.SourceLabel}
	}
	for _, step := range steps {
		result.Steps = append(result.Steps, StepView{step.ID, step.Title, step.Done})
	}
	return result
}
