package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"

	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
)

type TodoView struct {
	TodoRecord
	BuiltinKey  *string
	Name        string
	Icon        string
	FilterQuery json.RawMessage `gorm:"type:jsonb"`
	SearchText  string          // 兼容旧客户端；新客户端将文本条件写入FilterQuery，保存时清空此字段。
	Sort        string
	Version     int
	DeletedAt   *time.Time
}

func (TodoView) TableName() string { return "omw_todo_view" }

func TodoViewInfo(v TodoView) todoresp.ViewResponse {
	return todoresp.ViewResponse{ID: v.ID, BuiltinKey: v.BuiltinKey, Name: v.Name, Icon: v.Icon, FilterQuery: v.FilterQuery, SearchText: v.SearchText, Sort: v.Sort, Version: v.Version}
}

func (r *TodoViewRepository) views(userID int64) ([]TodoView, error) {
	views := []TodoView{}
	err := r.db.Where("user_id = ? AND deleted_at IS NULL", userID).Order("created_at, id").Find(&views).Error
	return views, err
}

func (r *TodoViewRepository) HasViewHistory(userID int64) (bool, error) {
	var found []int64
	err := r.db.Model(&TodoView{}).Where("user_id = ?", userID).Limit(1).Pluck("id", &found).Error
	return len(found) > 0, err
}

func (r *TodoViewRepository) FindView(userID, id int64) (TodoView, error) {
	var view TodoView
	err := r.db.Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).First(&view).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return view, tododomain.ErrNotFound
	}
	return view, err
}

func (r *TodoViewRepository) ViewCount(userID int64) (int64, error) {
	var count int64
	err := r.db.Model(&TodoView{}).Where("user_id = ? AND deleted_at IS NULL", userID).Count(&count).Error
	return count, err
}

func (r *TodoViewRepository) ViewNameAvailable(userID, id int64, name string) error {
	var count int64
	if err := r.db.Model(&TodoView{}).Where("user_id = ? AND id <> ? AND name = ? AND deleted_at IS NULL", userID, id, name).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return tododomain.ErrViewName
	}
	return nil
}

func (r *TodoViewRepository) SaveView(view *TodoView) error {
	return r.db.Save(view).Error
}

func (r *TodoViewRepository) DeleteView(userID, id int64, at time.Time) error {
	return r.db.Model(&TodoView{}).Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).Updates(map[string]any{"deleted_at": at, "updated_at": at, "version": gorm.Expr("version + 1")}).Error
}

func (r *TodoViewRepository) Views(ctx context.Context, userID int64) ([]todoresp.ViewResponse, error) {
	views, err := New(r.db.WithContext(ctx), nil).TodoView.views(userID)
	out := []todoresp.ViewResponse{}
	for _, v := range views {
		out = append(out, TodoViewInfo(v))
	}
	return out, err
}

type TodoViewRepository struct{ *Store }
