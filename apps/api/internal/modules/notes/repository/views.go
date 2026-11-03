package repository

import (
	"context"
	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
	"gorm.io/gorm"
	"time"
)

func (r *Repository) Views(ctx context.Context, user int64) ([]d.SavedView, error) {
	out := []d.SavedView{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&d.SavedView{}).Where("user_id=?", user).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			for _, seed := range []struct{ scope, name, icon string }{{"favorite", "收藏", "star"}, {"locked", "加锁", "lock"}} {
				now := time.Now().UTC()
				key := seed.scope
				view := d.SavedView{Record: d.Record{ID: idgen.Next(), UserID: user, CreatedAt: now, UpdatedAt: now}, Name: seed.name, Icon: seed.icon, Scope: "all", Sort: "updated", BuiltinKey: &key, FilterQuery: []byte(`{"schemaVersion":1,"root":{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"` + map[string]string{"favorite": "favorite", "locked": "requiresUnlock"}[seed.scope] + `"},{"kind":"constant","value":true}]}}`), Version: 1}
				if err := tx.Create(&view).Error; err != nil {
					return err
				}
			}
		}
		return tx.Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Order("created_at,id").Find(&out).Error
	})
	return out, err
}
func (r *Repository) FindView(ctx context.Context, user int64, id string) (d.SavedView, error) {
	var out d.SavedView
	err := r.db.WithContext(ctx).Where("user_id=? AND id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user, id).First(&out).Error
	return out, missing(err)
}
func (r *Repository) SaveView(ctx context.Context, user int64, input d.ViewInput) (d.SavedView, error) {
	var out d.SavedView
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		now := time.Now().UTC()
		if input.ID == "" {
			var count int64
			if err := tx.Model(&d.SavedView{}).Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Count(&count).Error; err != nil {
				return err
			}
			if count >= 100 {
				return d.ErrInvalid
			}
			out = d.SavedView{Record: d.Record{ID: idgen.Next(), UserID: user, CreatedAt: now}, Version: 0}
		} else {
			if err := tx.Where("user_id=? AND id=? AND deleted_at IS NULL", user, input.ID).First(&out).Error; err != nil {
				return missing(err)
			}
			if out.BuiltinKey != nil && (*out.BuiltinKey == "all" || *out.BuiltinKey == "trash") {
				return d.ErrInvalid
			}
			if out.Version != input.Version {
				return d.ErrViewConflict
			}
		}
		var duplicate int64
		if err := tx.Model(&d.SavedView{}).Where("user_id=? AND id<>? AND name=? AND deleted_at IS NULL", user, out.ID, input.Name).Count(&duplicate).Error; err != nil {
			return err
		}
		if duplicate > 0 {
			return d.ErrViewName
		}
		out.Name = input.Name
		out.Icon = input.Icon
		out.Scope = input.Scope
		out.FilterQuery = input.FilterQuery
		out.Sort = input.Sort
		out.Version++
		out.UpdatedAt = now
		return tx.Save(&out).Error
	})
	return out, err
}
func (r *Repository) DeleteView(ctx context.Context, user int64, target d.Target) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&d.SavedView{}).Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Count(&count).Error; err != nil {
			return err
		}
		var view d.SavedView
		if err := tx.Where("user_id=? AND id=? AND deleted_at IS NULL", user, target.ID).First(&view).Error; err != nil {
			return missing(err)
		}
		if view.BuiltinKey != nil && (*view.BuiltinKey == "all" || *view.BuiltinKey == "trash") {
			return d.ErrInvalid
		}
		if view.Version != target.Version {
			return d.ErrViewConflict
		}
		if count <= 1 {
			return d.ErrLastView
		}
		return tx.Model(&view).Updates(map[string]any{"deleted_at": time.Now().UTC(), "version": view.Version + 1}).Error
	})
}
