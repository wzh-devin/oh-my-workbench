package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"

	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
)

type TodoList struct {
	TodoRecord
	Name     string
	LegacyID *string
}

func (TodoList) TableName() string { return "omw_todo_list" }

func TodoListInfo(list TodoList) todoresp.ListResponse {
	return todoresp.ListResponse{ID: list.ID, Name: list.Name, CreatedAt: list.CreatedAt, UpdatedAt: list.UpdatedAt}
}

func (r *TodoListRepository) List(userID, id int64) (TodoList, error) {
	var list TodoList
	err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&list).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return list, tododomain.ErrNotFound
	}
	return list, err
}

func (r *TodoListRepository) NameAvailable(userID int64, name string, except int64) error {
	var count int64
	if err := r.db.Model(&TodoList{}).Where("user_id = ? AND name = ? AND id <> ?", userID, name, except).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return tododomain.ErrListName
	}
	return nil
}

func (r *TodoListRepository) SaveList(list *TodoList) error {
	return r.db.Save(list).Error
}

func (r *TodoListRepository) CreateList(list *TodoList) error {
	return r.db.Create(list).Error
}

func (r *TodoListRepository) DeleteList(userID, id int64) error {
	return r.db.Where("user_id = ? AND id = ?", userID, id).Delete(&TodoList{}).Error
}

func (r *TodoListRepository) ListByLegacy(userID int64, legacyID string) (TodoList, bool, error) {
	var list TodoList
	result := r.db.Where("user_id = ? AND legacy_id = ?", userID, legacyID).Limit(1).Find(&list)
	return list, result.RowsAffected > 0, result.Error
}

func (r *TodoListRepository) OwnedLists(userID int64, ids []int64) ([]int64, error) {
	owned := []int64{}
	if len(ids) == 0 {
		return owned, nil
	}
	err := r.db.Model(&TodoList{}).Where("user_id = ? AND id IN ?", userID, ids).Pluck("id", &owned).Error
	return owned, err
}

func (r *TodoListRepository) Lists(ctx context.Context, userID int64) ([]todoresp.ListResponse, error) {
	lists := []TodoList{}
	err := r.db.WithContext(ctx).Where("user_id=?", userID).Order("created_at,id").Find(&lists).Error
	out := []todoresp.ListResponse{}
	for _, v := range lists {
		out = append(out, TodoListInfo(v))
	}
	return out, err
}

type TodoListRepository struct{ *Store }
