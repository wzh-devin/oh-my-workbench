// Package repository owns notebook persistence, user-scoped transactions and unlock leases.
package repository

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewRepository(db *gorm.DB, rdb *redis.Client) *Repository { return &Repository{db: db, rdb: rdb} }
func missing(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return d.ErrNotFound
	}
	return err
}

// Serialize notebook moves/deletes with note saves so dangling notebook IDs cannot be committed.
func userLock(tx *gorm.DB, user int64) error {
	var id int64
	return tx.Raw("SELECT id FROM omw_user WHERE id=? FOR UPDATE", user).Scan(&id).Error
}
func (r *Repository) Notebooks(ctx context.Context, user int64) ([]d.Notebook, error) {
	out := []d.Notebook{}
	err := r.db.WithContext(ctx).Where("user_id=?", user).Order("position,id").Find(&out).Error
	return out, err
}
func (r *Repository) SaveNotebook(ctx context.Context, user, id int64, version int, name string) (d.Notebook, error) {
	var out d.Notebook
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		now := time.Now().UTC()
		if id == 0 {
			out = d.Notebook{Record: d.Record{ID: idgen.Next(), UserID: user, CreatedAt: now, UpdatedAt: now}, Name: name, Version: 1}
			return tx.Create(&out).Error
		}
		if err := tx.Where("user_id=? AND id=?", user, id).First(&out).Error; err != nil {
			return missing(err)
		}
		if out.Version != version {
			return d.ErrConflict
		}
		out.Name = name
		out.Version++
		out.UpdatedAt = now
		return tx.Save(&out).Error
	})
	return out, err
}
func (r *Repository) DeleteNotebooks(ctx context.Context, user int64, targets []d.Target) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		for _, target := range targets {
			var book d.Notebook
			if err := tx.Where("user_id=? AND id=?", user, target.ID).First(&book).Error; err != nil {
				return missing(err)
			}
			if book.Version != target.Version {
				return d.ErrConflict
			}
			if err := tx.Model(&d.Note{}).Where("user_id=? AND notebook_id=?", user, book.ID).Updates(map[string]any{"notebook_id": nil, "version": gorm.Expr("version+1"), "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&book).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
func (r *Repository) Metadata(ctx context.Context, user, id int64) (d.Note, error) {
	var out d.Note
	err := r.db.WithContext(ctx).Select("id,user_id,notebook_id,title,tags,requires_unlock,favorite,diary_date,version,created_at,updated_at,deleted_at").Where("user_id=? AND id=?", user, id).First(&out).Error
	return out, missing(err)
}
func (r *Repository) Note(ctx context.Context, user, id int64) (d.Note, error) {
	var out d.Note
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", user, id).First(&out).Error
	return out, missing(err)
}
func (r *Repository) Request(ctx context.Context, user int64, request string) (d.Note, error) {
	var out d.Note
	err := r.db.WithContext(ctx).Where("user_id=? AND create_request_id=?", user, request).First(&out).Error
	return out, missing(err)
}
func (r *Repository) Page(ctx context.Context, user int64, q d.Query) (d.Page, error) {
	out := d.Page{Records: []d.NoteView{}, PageNum: q.PageNum, PageSize: q.PageSize}
	predicate, args, err := RuleSQL(q.FilterQuery)
	if err != nil {
		return out, err
	}
	savedPredicate, savedArgs, err := RuleSQL(q.SavedRule)
	if err != nil {
		return out, err
	}
	order := map[string]string{"title": "n.title ASC,n.id DESC", "created": "n.created_at DESC,n.id DESC"}[q.Sort]
	if order == "" {
		order = "n.updated_at DESC,n.id DESC"
	}
	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		base := tx.Table("omw_note n").Where("n.user_id=?", user).Where(predicate, args...).Where(savedPredicate, savedArgs...)
		if q.Scope == "trash" {
			base = base.Where("n.deleted_at IS NOT NULL")
		} else {
			base = base.Where("n.deleted_at IS NULL")
		}
		if q.Scope == "favorite" {
			base = base.Where("n.favorite=TRUE")
		}
		if q.Scope == "locked" {
			base = base.Where("n.requires_unlock=TRUE")
		}
		if q.NotebookID == "unfiled" {
			base = base.Where("n.notebook_id IS NULL")
		} else if q.NotebookID != "" {
			base = base.Where("n.notebook_id=?", q.NotebookID)
		}
		if q.Search != "" {
			text := strings.ToLower(q.Search)
			base = base.Where("(strpos(lower(n.title),?)>0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(n.tags) tag WHERE strpos(lower(tag),?)>0))", text, text)
		}
		if err := base.Count(&out.Total).Error; err != nil {
			return err
		}
		notes := []d.Note{}
		// Ciphertext and request IDs never belong in list responses or list queries.
		columns := "n.id,n.user_id,n.notebook_id,n.title,n.tags,n.requires_unlock,n.favorite,n.diary_date,n.version,n.created_at,n.updated_at,n.deleted_at"
		if err := base.Select(columns).Order(order).Offset((q.PageNum - 1) * q.PageSize).Limit(q.PageSize).Find(&notes).Error; err != nil {
			return err
		}
		for _, note := range notes {
			out.Records = append(out.Records, d.View(note))
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}
func checkpoint(tx *gorm.DB, n d.Note, force bool) error {
	var last d.Revision
	err := tx.Where("user_id=? AND note_id=?", n.UserID, n.ID).Order("created_at DESC,id DESC").First(&last).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err == nil && !force && time.Since(last.CreatedAt) < 30*time.Second {
		return nil
	}
	now := time.Now().UTC()
	revision := d.Revision{Record: d.Record{ID: idgen.Next(), UserID: n.UserID, CreatedAt: now, UpdatedAt: now}, NoteID: n.ID, NoteVersion: n.Version, BodyCiphertext: n.BodyCiphertext, KeyID: n.KeyID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&revision).Error; err != nil {
		return err
	}
	return tx.Exec("DELETE FROM omw_note_revision WHERE user_id=? AND note_id=? AND id NOT IN (SELECT id FROM omw_note_revision WHERE user_id=? AND note_id=? ORDER BY created_at DESC,id DESC LIMIT 50)", n.UserID, n.ID, n.UserID, n.ID).Error
}

// Save commits CAS, notebook integrity and the previous encrypted recovery point atomically.
func (r *Repository) Save(ctx context.Context, n d.Note, expected int, force bool) (d.Note, error) {
	var out d.Note
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, n.UserID); err != nil {
			return err
		}
		if expected == 0 {
			err := tx.Where("user_id=? AND create_request_id=?", n.UserID, n.CreateRequestID).First(&out).Error
			if err == nil {
				return nil
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		} else {
			if err := tx.Where("user_id=? AND id=?", n.UserID, n.ID).First(&out).Error; err != nil {
				return missing(err)
			}
			if out.Version != expected {
				return d.ErrConflict
			}
			if out.DeletedAt != nil {
				return d.ErrNotFound
			}
			if err := checkpoint(tx, out, force); err != nil {
				return err
			}
			n.CreatedAt = out.CreatedAt
			n.CreateRequestID = out.CreateRequestID
		}
		if n.NotebookID != nil {
			var book d.Notebook
			if err := tx.Where("user_id=? AND id=?", n.UserID, *n.NotebookID).First(&book).Error; err != nil {
				return missing(err)
			}
		}
		n.Version = expected + 1
		n.UpdatedAt = time.Now().UTC()
		if expected == 0 {
			n.CreatedAt = n.UpdatedAt
			if err := tx.Create(&n).Error; err != nil {
				return err
			}
			if err := checkpoint(tx, n, true); err != nil {
				return err
			}
		} else {
			if err := tx.Save(&n).Error; err != nil {
				return err
			}
		}
		out = n
		return nil
	})
	return out, err
}

// Batch is all-or-nothing and rechecks version/unlock under the same user lock as saves.
func (r *Repository) Batch(ctx context.Context, user int64, targets []d.Target, action string, unlocked bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		for _, target := range targets {
			var note d.Note
			if err := tx.Where("user_id=? AND id=?", user, target.ID).First(&note).Error; err != nil {
				return missing(err)
			}
			if note.Version != target.Version {
				return d.ErrConflict
			}
			if note.RequiresUnlock && !unlocked {
				return d.ErrLocked
			}
			switch action {
			case "purge":
				if note.DeletedAt == nil {
					return d.ErrInvalid
				}
				if err := tx.Where("user_id=? AND note_id=?", user, note.ID).Delete(&d.Revision{}).Error; err != nil {
					return err
				}
				if err := tx.Delete(&note).Error; err != nil {
					return err
				}
			case "restore", "delete":
				if (action == "restore") != (note.DeletedAt != nil) {
					return d.ErrConflict
				}
				var deleted any
				if action == "delete" {
					deleted = time.Now().UTC()
				}
				if err := tx.Model(&note).Updates(map[string]any{"deleted_at": deleted, "version": note.Version + 1, "updated_at": time.Now().UTC()}).Error; err != nil {
					return err
				}
			default:
				return d.ErrInvalid
			}
		}
		return nil
	})
}
func (r *Repository) Revisions(ctx context.Context, user, note int64) ([]d.Revision, error) {
	out := []d.Revision{}
	err := r.db.WithContext(ctx).Select("id,note_id,note_version,created_at").Where("user_id=? AND note_id=?", user, note).Order("created_at DESC,id DESC").Limit(50).Find(&out).Error
	return out, err
}
func (r *Repository) Revision(ctx context.Context, user, note, id int64) (d.Revision, error) {
	var out d.Revision
	err := r.db.WithContext(ctx).Where("user_id=? AND note_id=? AND id=?", user, note, id).First(&out).Error
	return out, missing(err)
}
func unlockKey(user int64, session string) string {
	return "notes:unlock:" + strconv.FormatInt(user, 10) + ":" + session
}
func (r *Repository) Unlocked(ctx context.Context, user int64, session string) (bool, error) {
	if session == "" {
		return false, nil
	}
	n, err := r.rdb.Exists(ctx, unlockKey(user, session)).Result()
	return n == 1, err
}
func (r *Repository) Unlock(ctx context.Context, user int64, session string) error {
	if session == "" {
		return d.ErrInvalid
	}
	return r.rdb.Set(ctx, unlockKey(user, session), "1", 5*time.Minute).Err()
}
func (r *Repository) Lock(ctx context.Context, user int64, session string) error {
	return r.rdb.Del(ctx, unlockKey(user, session)).Err()
}

func (r *Repository) UnlockExpiry(ctx context.Context, user int64, session string) (time.Time, error) {
	ttl, err := r.rdb.PTTL(ctx, unlockKey(user, session)).Result()
	if err != nil {
		return time.Time{}, err
	}
	if ttl <= 0 {
		return time.Time{}, d.ErrLocked
	}
	return time.Now().UTC().Add(ttl), nil
}
