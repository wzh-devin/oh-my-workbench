package repository

import (
	"errors"
	"time"

	"gorm.io/gorm"

	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
)

func (r *Repository) views(userID int64) ([]tododomain.View, error) {
	views := []tododomain.View{}
	err := r.db.Where("user_id = ? AND deleted_at IS NULL", userID).Order("created_at, id").Find(&views).Error
	return views, err
}

func (r *Repository) Priorities(userID int64) ([]tododomain.Priority, error) {
	priorities := []tododomain.Priority{}
	err := r.db.Where("user_id = ?", userID).Order("position, id").Find(&priorities).Error
	return priorities, err
}

func (r *Repository) HasViewHistory(userID int64) (bool, error) {
	var found []int64
	err := r.db.Model(&tododomain.View{}).Where("user_id = ?", userID).Limit(1).Pluck("id", &found).Error
	return len(found) > 0, err
}

func (r *Repository) FindView(userID, id int64) (tododomain.View, error) {
	var view tododomain.View
	err := r.db.Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).First(&view).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return view, tododomain.ErrNotFound
	}
	return view, err
}

func (r *Repository) ViewCount(userID int64) (int64, error) {
	var count int64
	err := r.db.Model(&tododomain.View{}).Where("user_id = ? AND deleted_at IS NULL", userID).Count(&count).Error
	return count, err
}

func (r *Repository) ViewNameAvailable(userID, id int64, name string) error {
	var count int64
	if err := r.db.Model(&tododomain.View{}).Where("user_id = ? AND id <> ? AND name = ? AND deleted_at IS NULL", userID, id, name).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return tododomain.ErrViewName
	}
	return nil
}

func (r *Repository) SaveView(view *tododomain.View) error { return r.db.Save(view).Error }

func (r *Repository) SavePriority(priority *tododomain.Priority) error {
	return r.db.Save(priority).Error
}

func (r *Repository) DeleteView(userID, id int64, at time.Time) error {
	return r.db.Model(&tododomain.View{}).Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).Updates(map[string]any{"deleted_at": at, "updated_at": at, "version": gorm.Expr("version + 1")}).Error
}

func (r *Repository) OwnedLists(userID int64, ids []int64) ([]int64, error) {
	owned := []int64{}
	if len(ids) == 0 {
		return owned, nil
	}
	err := r.db.Model(&tododomain.List{}).Where("user_id = ? AND id IN ?", userID, ids).Pluck("id", &owned).Error
	return owned, err
}
