package repository

import (
	"context"

	"gorm.io/gorm"
)

// Hold a short startup lock while checking references and preparing the external key file.
func (r *Repository) PrepareKeys(ctx context.Context, prepare func([]string) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE omw_note, omw_note_revision IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		var ids []string
		if err := tx.Raw("SELECT key_id FROM omw_note UNION SELECT key_id FROM omw_note_revision").Scan(&ids).Error; err != nil {
			return err
		}
		return prepare(ids)
	})
}
