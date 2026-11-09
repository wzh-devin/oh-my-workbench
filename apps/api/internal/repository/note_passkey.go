package repository

import (
	"context"
	"encoding/json"

	"gorm.io/gorm"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
)

type NotePasskey struct {
	UserID     int64  `gorm:"primaryKey;autoIncrement:false"`
	RPID       string `gorm:"primaryKey;column:rp_id"`
	UserHandle []byte
	Credential json.RawMessage `gorm:"type:jsonb"`
	Version    int
}

func (NotePasskey) TableName() string { return "omw_note_passkey" }

func (r *NotePasskeyRepository) Passkey(ctx context.Context, user int64, rp string) (NotePasskey, error) {
	var out NotePasskey
	err := r.db.WithContext(ctx).Where("user_id=? AND rp_id=?", user, rp).First(&out).Error
	return out, notesMissing(err)
}

// A revoked/replaced credential cannot be resurrected by an earlier in-flight ceremony.
func (r *NotePasskeyRepository) SavePasskey(ctx context.Context, record NotePasskey, expected int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, record.UserID); err != nil {
			return err
		}
		var old NotePasskey
		err := tx.Where("user_id=? AND rp_id=?", record.UserID, record.RPID).First(&old).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if old.Version != expected {
			return notedomain.ErrPasskeyChanged
		}
		record.Version = expected + 1
		return tx.Save(&record).Error
	})
}

func (r *NotePasskeyRepository) DeletePasskey(ctx context.Context, user int64, rp string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := notesUserLock(tx, user); err != nil {
			return err
		}
		return tx.Model(&NotePasskey{}).Where("user_id=? AND rp_id=?", user, rp).Updates(map[string]any{"credential": nil, "version": gorm.Expr("version+1")}).Error
	})
}

type NotePasskeyRepository struct{ *Store }
