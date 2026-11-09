package repository

import (
	"errors"
	"strconv"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

func notesMissing(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return notedomain.ErrNotFound
	}
	return err
}

// Serialize notebook moves/deletes with note saves so dangling notebook IDs cannot be committed.
func notesUserLock(tx *gorm.DB, user int64) error {
	var id int64
	return tx.Raw("SELECT id FROM omw_user WHERE id=? FOR UPDATE", user).Scan(&id).Error
}

func notesCheckpoint(tx *gorm.DB, n Note, force bool) error {
	var last NoteRevision
	err := tx.Where("user_id=? AND note_id=?", n.UserID, n.ID).Order("created_at DESC,id DESC").First(&last).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if err == nil && !force && time.Since(last.CreatedAt) < 30*time.Second {
		return nil
	}
	now := time.Now().UTC()
	revision := NoteRevision{NoteRecord: NoteRecord{ID: idgen.Next(), UserID: n.UserID, CreatedAt: now, UpdatedAt: now}, NoteID: n.ID, NoteVersion: n.Version, BodyCiphertext: n.BodyCiphertext, KeyID: n.KeyID}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&revision).Error; err != nil {
		return err
	}
	return tx.Exec("DELETE FROM omw_note_revision WHERE user_id=? AND note_id=? AND id NOT IN (SELECT id FROM omw_note_revision WHERE user_id=? AND note_id=? ORDER BY created_at DESC,id DESC LIMIT 50)", n.UserID, n.ID, n.UserID, n.ID).Error
}

func notesUnlockKey(user int64, session string) string {
	return "notes:unlock:" + strconv.FormatInt(user, 10) + ":" + session
}
