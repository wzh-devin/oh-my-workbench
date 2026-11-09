package repository

import (
	"context"
	"encoding/json"
	"time"

	"gorm.io/gorm"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type NoteView struct {
	NoteRecord
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery" gorm:"type:jsonb"`
	Sort        string          `json:"sort"`
	BuiltinKey  *string         `json:"-"`
	Version     int             `json:"version"`
	DeletedAt   *time.Time      `json:"-"`
}

func (NoteView) TableName() string { return "omw_note_view" }

func (r *NoteViewRepository) Views(ctx context.Context, user int64) ([]NoteView, error) {
	out := []NoteView{}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&NoteView{}).Where("user_id=?", user).Count(&count).Error; err != nil {
			return err
		}
		if count == 0 {
			for _, seed := range []struct{ scope, name, icon string }{{"favorite", "收藏", "star"}, {"locked", "加锁", "lock"}} {
				now := time.Now().UTC()
				key := seed.scope
				view := NoteView{NoteRecord: NoteRecord{ID: idgen.Next(), UserID: user, CreatedAt: now, UpdatedAt: now}, Name: seed.name, Icon: seed.icon, Scope: "all", Sort: "updated", BuiltinKey: &key, FilterQuery: []byte(`{"schemaVersion":1,"root":{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"` + map[string]string{"favorite": "favorite", "locked": "requiresUnlock"}[seed.scope] + `"},{"kind":"constant","value":true}]}}`), Version: 1}
				if err := tx.Create(&view).Error; err != nil {
					return err
				}
			}
		}
		return tx.Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Order("created_at,id").Find(&out).Error
	})
	return out, err
}

func (r *NoteViewRepository) FindView(ctx context.Context, user int64, id string) (NoteView, error) {
	var out NoteView
	err := r.db.WithContext(ctx).Where("user_id=? AND id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user, id).First(&out).Error
	return out, notesMissing(err)
}

func (r *NoteViewRepository) SaveView(ctx context.Context, user int64, input notereq.SaveViewRequest) (NoteView, error) {
	var out NoteView
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		now := time.Now().UTC()
		if input.ID == "" {
			var count int64
			if err := tx.Model(&NoteView{}).Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Count(&count).Error; err != nil {
				return err
			}
			if count >= 100 {
				return notedomain.ErrInvalid
			}
			out = NoteView{NoteRecord: NoteRecord{ID: idgen.Next(), UserID: user, CreatedAt: now}, Version: 0}
		} else {
			if err := tx.Where("user_id=? AND id=? AND deleted_at IS NULL", user, input.ID).First(&out).Error; err != nil {
				return notesMissing(err)
			}
			if out.BuiltinKey != nil && (*out.BuiltinKey == "all" || *out.BuiltinKey == "trash") {
				return notedomain.ErrInvalid
			}
			if out.Version != input.Version {
				return notedomain.ErrViewConflict
			}
		}
		var duplicate int64
		if err := tx.Model(&NoteView{}).Where("user_id=? AND id<>? AND name=? AND deleted_at IS NULL", user, out.ID, input.Name).Count(&duplicate).Error; err != nil {
			return err
		}
		if duplicate > 0 {
			return notedomain.ErrViewName
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

func (r *NoteViewRepository) DeleteView(ctx context.Context, user int64, target notereq.TargetRequest) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		var count int64
		if err := tx.Model(&NoteView{}).Where("user_id=? AND deleted_at IS NULL AND (builtin_key IS NULL OR builtin_key NOT IN ('all','trash'))", user).Count(&count).Error; err != nil {
			return err
		}
		var view NoteView
		if err := tx.Where("user_id=? AND id=? AND deleted_at IS NULL", user, target.ID).First(&view).Error; err != nil {
			return notesMissing(err)
		}
		if view.BuiltinKey != nil && (*view.BuiltinKey == "all" || *view.BuiltinKey == "trash") {
			return notedomain.ErrInvalid
		}
		if view.Version != target.Version {
			return notedomain.ErrViewConflict
		}
		if count <= 1 {
			return notedomain.ErrLastView
		}
		return tx.Model(&view).Updates(map[string]any{"deleted_at": time.Now().UTC(), "version": view.Version + 1}).Error
	})
}

type NoteViewRepository struct{ *Store }
