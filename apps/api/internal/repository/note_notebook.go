package repository

import (
	"context"
	"time"

	"gorm.io/gorm"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type NoteNotebook struct {
	NoteRecord
	Name     string
	Position int
	Version  int
}

func (NoteNotebook) TableName() string { return "omw_note_notebook" }

func (r *NoteNotebookRepository) Notebooks(ctx context.Context, user int64) ([]NoteNotebook, error) {
	out := []NoteNotebook{}
	err := r.db.WithContext(ctx).Where("user_id=?", user).Order("position,id").Find(&out).Error
	return out, err
}

func (r *NoteNotebookRepository) SaveNotebook(ctx context.Context, user, id int64, version int, name string) (NoteNotebook, error) {
	var out NoteNotebook
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		now := time.Now().UTC()
		if id == 0 {
			out = NoteNotebook{NoteRecord: NoteRecord{ID: idgen.Next(), UserID: user, CreatedAt: now, UpdatedAt: now}, Name: name, Version: 1}
			return tx.Create(&out).Error
		}
		if err := tx.Where("user_id=? AND id=?", user, id).First(&out).Error; err != nil {
			return notesMissing(err)
		}
		if out.Version != version {
			return notedomain.ErrConflict
		}
		out.Name = name
		out.Version++
		out.UpdatedAt = now
		return tx.Save(&out).Error
	})
	return out, err
}

func (r *NoteNotebookRepository) DeleteNotebooks(ctx context.Context, user int64, targets []notereq.TargetRequest) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		for _, target := range targets {
			var book NoteNotebook
			if err := tx.Where("user_id=? AND id=?", user, target.ID).First(&book).Error; err != nil {
				return notesMissing(err)
			}
			if book.Version != target.Version {
				return notedomain.ErrConflict
			}
			if err := tx.Model(&Note{}).Where("user_id=? AND notebook_id=?", user, book.ID).Updates(map[string]any{"notebook_id": nil, "version": gorm.Expr("version+1"), "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&book).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

type NoteNotebookRepository struct{ *Store }
