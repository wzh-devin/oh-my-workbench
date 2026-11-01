package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) List(ctx context.Context, userID int64, keys []string) ([]settingsdomain.Setting, error) {
	var records []settingsdomain.Setting
	err := r.db.WithContext(ctx).Where("user_id = ? AND key IN ?", userID, keys).Find(&records).Error
	return records, err
}

func (r *Repository) Get(ctx context.Context, userID int64, key string) (settingsdomain.Setting, error) {
	var record settingsdomain.Setting
	err := r.db.WithContext(ctx).Where("user_id = ? AND key = ?", userID, key).Find(&record).Error
	return record, err
}

// The owner lock serializes edits, including concurrent first saves with version zero.
func (r *Repository) Save(ctx context.Context, userID int64, key string, value []byte, version int) (settingsdomain.Setting, error) {
	var record settingsdomain.Setting
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owner struct{ ID int64 }
		if err := tx.Table("omw_user").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", userID).First(&owner).Error; err != nil {
			return err
		}
		err := tx.Where("user_id = ? AND key = ?", userID, key).First(&record).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if record.Version != version {
			return settingsdomain.ErrConflict
		}
		now := time.Now().UTC()
		if record.ID == 0 {
			record = settingsdomain.Setting{ID: idgen.Next(), UserID: userID, Key: key, CreatedAt: now}
		}
		record.Value, record.Version, record.UpdatedAt = value, version+1, now
		return tx.Save(&record).Error
	})
	return record, err
}
