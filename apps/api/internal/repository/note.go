package repository

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	noteresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/notes"
)

type Note struct {
	NoteRecord
	NotebookID      *int64
	Title           string
	Tags            []string `gorm:"serializer:json;type:jsonb"`
	BodyCiphertext  []byte
	KeyID           string
	RequiresUnlock  bool
	Favorite        bool
	DiaryDate       *time.Time
	Version         int
	DeletedAt       *time.Time
	CreateRequestID string
}

func (Note) TableName() string { return "omw_note" }

func NoteInfo(n Note) noteresp.NoteResponse {
	out := noteresp.NoteResponse{ID: strconv.FormatInt(n.ID, 10), Title: n.Title, Tags: n.Tags, RequiresUnlock: n.RequiresUnlock, Favorite: n.Favorite, Version: n.Version, CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt, DeletedAt: n.DeletedAt}
	if out.Tags == nil {
		out.Tags = []string{}
	}
	if n.NotebookID != nil {
		v := strconv.FormatInt(*n.NotebookID, 10)
		out.NotebookID = &v
	}
	if n.DiaryDate != nil {
		v := n.DiaryDate.Format(time.DateOnly)
		out.DiaryDate = &v
	}
	return out
}

// Serialize key initialization with note writes and use one transaction for the setting and references.
func (r *NoteRepository) PrepareKeys(ctx context.Context, prepare func(*Store, []string) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE omw_note, omw_note_revision IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		var ids []string
		if err := tx.Raw("SELECT key_id FROM omw_note UNION SELECT key_id FROM omw_note_revision").Scan(&ids).Error; err != nil {
			return err
		}
		return prepare(New(tx, nil), ids)
	})
}

// VerifyKeys streams current bodies and history through the service decryptor during import.
func (r *NoteRepository) VerifyKeys(ctx context.Context, verify func(int64, int64, string, []byte) error) error {
	rows, err := r.db.WithContext(ctx).Raw("SELECT user_id,id,key_id,body_ciphertext FROM omw_note UNION ALL SELECT user_id,note_id,key_id,body_ciphertext FROM omw_note_revision").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var user, note int64
		var keyID string
		var ciphertext []byte
		if err := rows.Scan(&user, &note, &keyID, &ciphertext); err != nil {
			return err
		}
		if err := verify(user, note, keyID, ciphertext); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (r *NoteRepository) Metadata(ctx context.Context, user, id int64) (Note, error) {
	var out Note
	err := r.db.WithContext(ctx).Select("id,user_id,notebook_id,title,tags,requires_unlock,favorite,diary_date,version,created_at,updated_at,deleted_at").Where("user_id=? AND id=?", user, id).First(&out).Error
	return out, notesMissing(err)
}

func (r *NoteRepository) Note(ctx context.Context, user, id int64) (Note, error) {
	var out Note
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", user, id).First(&out).Error
	return out, notesMissing(err)
}

func (r *NoteRepository) Request(ctx context.Context, user int64, request string) (Note, error) {
	var out Note
	err := r.db.WithContext(ctx).Where("user_id=? AND create_request_id=?", user, request).First(&out).Error
	return out, notesMissing(err)
}

func (r *NoteRepository) Page(ctx context.Context, user int64, q notereq.NotePageRequest) (noteresp.NotePageResponse, error) {
	out := noteresp.NotePageResponse{Records: []noteresp.NoteResponse{}, PageNum: q.PageNum, PageSize: q.PageSize}
	predicate, args, err := NotesRuleSQL(q.FilterQuery)
	if err != nil {
		return out, err
	}
	savedPredicate, savedArgs, err := NotesRuleSQL(q.SavedRule)
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
		notes := []Note{}
		// Ciphertext and request IDs never belong in list responses or list queries.
		columns := "n.id,n.user_id,n.notebook_id,n.title,n.tags,n.requires_unlock,n.favorite,n.diary_date,n.version,n.created_at,n.updated_at,n.deleted_at"
		if err := base.Select(columns).Order(order).Offset((q.PageNum - 1) * q.PageSize).Limit(q.PageSize).Find(&notes).Error; err != nil {
			return err
		}
		for _, note := range notes {
			out.Records = append(out.Records, NoteInfo(note))
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// Save commits CAS, notebook integrity and the previous encrypted recovery point atomically.
func (r *NoteRepository) Save(ctx context.Context, n Note, expected int, force bool) (Note, error) {
	var out Note
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, n.UserID); err != nil {
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
				return notesMissing(err)
			}
			if out.Version != expected {
				return notedomain.ErrConflict
			}
			if out.DeletedAt != nil {
				return notedomain.ErrNotFound
			}
			if err := notesCheckpoint(tx, out, force); err != nil {
				return err
			}
			n.CreatedAt = out.CreatedAt
			n.CreateRequestID = out.CreateRequestID
		}
		if n.NotebookID != nil {
			var book NoteNotebook
			if err := tx.Where("user_id=? AND id=?", n.UserID, *n.NotebookID).First(&book).Error; err != nil {
				return notesMissing(err)
			}
		}
		n.Version = expected + 1
		n.UpdatedAt = time.Now().UTC()
		if expected == 0 {
			n.CreatedAt = n.UpdatedAt
			if err := tx.Create(&n).Error; err != nil {
				return err
			}
			if err := notesCheckpoint(tx, n, true); err != nil {
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
func (r *NoteRepository) Batch(ctx context.Context, user int64, targets []notereq.TargetRequest, action string, unlocked bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		for _, target := range targets {
			var note Note
			if err := tx.Where("user_id=? AND id=?", user, target.ID).First(&note).Error; err != nil {
				return notesMissing(err)
			}
			if note.Version != target.Version {
				return notedomain.ErrConflict
			}
			if note.RequiresUnlock && !unlocked {
				return notedomain.ErrLocked
			}
			switch action {
			case "purge":
				if note.DeletedAt == nil {
					return notedomain.ErrInvalid
				}
				if err := tx.Where("user_id=? AND note_id=?", user, note.ID).Delete(&NoteRevision{}).Error; err != nil {
					return err
				}
				if err := tx.Delete(&note).Error; err != nil {
					return err
				}
			case "restore", "delete":
				if (action == "restore") != (note.DeletedAt != nil) {
					return notedomain.ErrConflict
				}
				var deleted any
				if action == "delete" {
					deleted = time.Now().UTC()
				}
				if err := tx.Model(&note).Updates(map[string]any{"deleted_at": deleted, "version": note.Version + 1, "updated_at": time.Now().UTC()}).Error; err != nil {
					return err
				}
			default:
				return notedomain.ErrInvalid
			}
		}
		return nil
	})
}

type NoteRepository struct{ *Store }
