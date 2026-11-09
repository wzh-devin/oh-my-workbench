package repository

import (
	"context"

	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
)

type TodoPriority struct {
	TodoRecord
	Value    int
	Name     string
	Color    string
	Position int
	Version  int
}

func (TodoPriority) TableName() string { return "omw_todo_priority" }

func TodoPriorityInfo(p TodoPriority) todoresp.PriorityResponse {
	color, _ := tododomain.NormalizePriorityColor(p.Color)
	return todoresp.PriorityResponse{ID: p.ID, Value: p.Value, Name: p.Name, Color: color, Position: p.Position, Version: p.Version}
}

func (r *TodoPriorityRepository) Priorities(userID int64) ([]TodoPriority, error) {
	priorities := []TodoPriority{}
	err := r.db.Where("user_id = ?", userID).Order("position, id").Find(&priorities).Error
	return priorities, err
}

func (r *TodoPriorityRepository) SavePriority(priority *TodoPriority) error {
	return r.db.Save(priority).Error
}

func (r *TodoPriorityRepository) ReadPriorities(ctx context.Context, userID int64) ([]todoresp.PriorityResponse, error) {
	values, err := New(r.db.WithContext(ctx), nil).TodoPriority.Priorities(userID)
	out := []todoresp.PriorityResponse{}
	for _, v := range values {
		out = append(out, TodoPriorityInfo(v))
	}
	return out, err
}

type TodoPriorityRepository struct{ *Store }
