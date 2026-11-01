package repository

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"gorm.io/gorm"

	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db} }

// 所有同用户写操作持有同一行锁，在无外键和唯一约束时维护关联与去重。
func (r *Repository) Write(ctx context.Context, userID int64, fn func(*Repository) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var id int64
		result := tx.Raw("SELECT id FROM omw_user WHERE id = ? FOR UPDATE", userID).Scan(&id)
		if result.Error != nil {
			return result.Error
		}
		if id == 0 {
			return tododomain.ErrNotFound
		}
		return fn(NewRepository(tx))
	})
}

func (r *Repository) ReadSnapshot(userID int64) (tododomain.Snapshot, error) {
	result := tododomain.Snapshot{Lists: []tododomain.ListView{}, Tasks: []tododomain.TaskView{}, Views: []tododomain.ViewInfo{}, Priorities: []tododomain.PriorityInfo{}}
	var lists []tododomain.List
	var tasks []tododomain.Task
	var steps []tododomain.Step
	if err := r.db.Where("user_id = ?", userID).Order("created_at, id").Find(&lists).Error; err != nil {
		return result, err
	}
	if err := r.db.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&tasks).Error; err != nil {
		return result, err
	}
	if err := r.db.Where("user_id = ?", userID).Order("todo_id, position, id").Find(&steps).Error; err != nil {
		return result, err
	}
	byTask := make(map[int64][]tododomain.Step)
	for _, step := range steps {
		byTask[step.TodoID] = append(byTask[step.TodoID], step)
	}
	for _, list := range lists {
		result.Lists = append(result.Lists, tododomain.ToListView(list))
	}
	for _, task := range tasks {
		result.Tasks = append(result.Tasks, tododomain.ToTaskView(task, byTask[task.ID]))
	}
	views, err := r.views(userID)
	if err != nil {
		return result, err
	}
	for _, view := range views {
		result.Views = append(result.Views, tododomain.ToViewInfo(view))
	}
	priorities, err := r.Priorities(userID)
	if err != nil {
		return result, err
	}
	for _, priority := range priorities {
		result.Priorities = append(result.Priorities, tododomain.ToPriorityInfo(priority))
	}
	return result, nil
}

// 批量读取共享只读快照，避免清单删除期间得到不一致归属或N+1查询。
func (r *Repository) Snapshot(ctx context.Context, userID int64) (tododomain.Snapshot, error) {
	var result tododomain.Snapshot
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = NewRepository(tx).ReadSnapshot(userID)
		return err
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *Repository) List(userID, id int64) (tododomain.List, error) {
	var list tododomain.List
	err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&list).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return list, tododomain.ErrNotFound
	}
	return list, err
}

func (r *Repository) Task(userID, id int64) (tododomain.Task, []tododomain.Step, error) {
	var task tododomain.Task
	steps := []tododomain.Step{}
	err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&task).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return task, steps, tododomain.ErrNotFound
	}
	if err != nil {
		return task, steps, err
	}
	err = r.db.Where("user_id = ? AND todo_id = ?", userID, id).Order("position, id").Find(&steps).Error
	return task, steps, err
}

func (r *Repository) NameAvailable(userID int64, name string, except int64) error {
	var count int64
	if err := r.db.Model(&tododomain.List{}).Where("user_id = ? AND name = ? AND id <> ?", userID, name, except).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return tododomain.ErrListName
	}
	return nil
}

func (r *Repository) SaveList(list *tododomain.List) error { return r.db.Save(list).Error }

func (r *Repository) CreateList(list *tododomain.List) error { return r.db.Create(list).Error }

func (r *Repository) DeleteList(userID, id int64) error {
	return r.db.Where("user_id = ? AND id = ?", userID, id).Delete(&tododomain.List{}).Error
}

func (r *Repository) MoveTasksToInbox(userID, listID int64, at time.Time) ([]tododomain.TaskView, error) {
	var tasks []tododomain.Task
	result := []tododomain.TaskView{}
	if err := r.db.Where("user_id = ? AND list_id = ?", userID, listID).Find(&tasks).Error; err != nil {
		return result, err
	}
	if len(tasks) == 0 {
		return result, nil
	}
	if err := r.db.Model(&tododomain.Task{}).Where("user_id = ? AND list_id = ?", userID, listID).Updates(map[string]any{"list_id": nil, "version": gorm.Expr("version + 1"), "updated_at": at}).Error; err != nil {
		return result, err
	}
	ids := make([]int64, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	var steps []tododomain.Step
	if err := r.db.Where("user_id = ? AND todo_id IN ?", userID, ids).Order("todo_id, position, id").Find(&steps).Error; err != nil {
		return result, err
	}
	byTask := map[int64][]tododomain.Step{}
	for _, step := range steps {
		byTask[step.TodoID] = append(byTask[step.TodoID], step)
	}
	for _, task := range tasks {
		task.ListID = nil
		task.Version++
		task.UpdatedAt = at
		result = append(result, tododomain.ToTaskView(task, byTask[task.ID]))
	}
	return result, nil
}

func (r *Repository) TaskBySource(userID int64, kind, reference string) (tododomain.Task, bool, error) {
	var task tododomain.Task
	result := r.db.Where("user_id = ? AND source_kind = ? AND source_ref = ?", userID, kind, reference).Limit(1).Find(&task)
	return task, result.RowsAffected > 0, result.Error
}

func (r *Repository) PersistTask(task *tododomain.Task, steps []tododomain.Step) error {
	if err := r.db.Save(task).Error; err != nil {
		return err
	}
	if err := r.db.Where("user_id = ? AND todo_id = ?", task.UserID, task.ID).Delete(&tododomain.Step{}).Error; err != nil {
		return err
	}
	if len(steps) > 0 {
		return r.db.Create(&steps).Error
	}
	return nil
}

func (r *Repository) DeleteTask(userID, id int64) error {
	if err := r.db.Where("user_id = ? AND todo_id = ?", userID, id).Delete(&tododomain.Step{}).Error; err != nil {
		return err
	}
	return r.db.Where("user_id = ? AND id = ?", userID, id).Delete(&tododomain.Task{}).Error
}

func (r *Repository) ListByLegacy(userID int64, legacyID string) (tododomain.List, bool, error) {
	var list tododomain.List
	result := r.db.Where("user_id = ? AND legacy_id = ?", userID, legacyID).Limit(1).Find(&list)
	return list, result.RowsAffected > 0, result.Error
}

func (r *Repository) TaskImported(userID int64, legacyID string) (bool, error) {
	var count int64
	err := r.db.Model(&tododomain.Task{}).Where("user_id = ? AND legacy_id = ?", userID, legacyID).Count(&count).Error
	return count > 0, err
}

func (r *Repository) RecordImport(userID, id int64, legacyID string, createdAt, completedAt *time.Time) error {
	values := map[string]any{"legacy_id": legacyID}
	if createdAt != nil {
		values["created_at"] = createdAt
		if completedAt != nil {
			values["completed_at"] = completedAt
		}
	}
	return r.db.Model(&tododomain.Task{}).Where("user_id = ? AND id = ? AND legacy_id IS NULL", userID, id).Updates(values).Error
}
