package todos

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

func (r *Repository) views(userID int64) ([]View, error) {
	views := []View{}
	err := r.db.Where("user_id = ? AND deleted_at IS NULL", userID).Order("created_at, id").Find(&views).Error
	return views, err
}
func (r *Repository) priorities(userID int64) ([]Priority, error) {
	priorities := []Priority{}
	err := r.db.Where("user_id = ?", userID).Order("position, id").Find(&priorities).Error
	return priorities, err
}
func (r *Repository) hasViewHistory(userID int64) (bool, error) {
	var found []int64
	err := r.db.Model(&View{}).Where("user_id = ?", userID).Limit(1).Pluck("id", &found).Error
	return len(found) > 0, err
}
func (r *Repository) view(userID, id int64) (View, error) {
	var view View
	err := r.db.Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).First(&view).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return view, ErrNotFound
	}
	return view, err
}
func (r *Repository) viewCount(userID int64) (int64, error) {
	var count int64
	err := r.db.Model(&View{}).Where("user_id = ? AND deleted_at IS NULL", userID).Count(&count).Error
	return count, err
}
func (r *Repository) viewNameAvailable(userID, id int64, name string) error {
	var count int64
	if err := r.db.Model(&View{}).Where("user_id = ? AND id <> ? AND name = ? AND deleted_at IS NULL", userID, id, name).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrViewName
	}
	return nil
}
func (r *Repository) saveView(view *View) error             { return r.db.Save(view).Error }
func (r *Repository) savePriority(priority *Priority) error { return r.db.Save(priority).Error }
func (r *Repository) deleteView(userID, id int64, at time.Time) error {
	return r.db.Model(&View{}).Where("user_id = ? AND id = ? AND deleted_at IS NULL", userID, id).Updates(map[string]any{"deleted_at": at, "updated_at": at, "version": gorm.Expr("version + 1")}).Error
}
func (r *Repository) ownedLists(userID int64, ids []int64) ([]int64, error) {
	owned := []int64{}
	if len(ids) == 0 {
		return owned, nil
	}
	err := r.db.Model(&List{}).Where("user_id = ? AND id IN ?", userID, ids).Pluck("id", &owned).Error
	return owned, err
}
