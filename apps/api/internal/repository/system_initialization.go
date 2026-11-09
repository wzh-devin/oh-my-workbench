package repository

import (
	"context"
	"time"
)

type SystemInitialization struct {
	ID          int64     `gorm:"type:bigint;autoIncrement:false;index:idx_omw_system_initialization_id"`
	AdminUserID int64     `gorm:"type:bigint"`
	CreatedAt   time.Time `gorm:"type:timestamptz"`
	UpdatedAt   time.Time `gorm:"type:timestamptz"`
}

func (SystemInitialization) TableName() string { return "omw_system_initialization" }

func (r *SystemInitializationRepository) Initialized(ctx context.Context) (bool, error) {
	var initialized bool
	err := r.db.WithContext(ctx).Raw(`SELECT EXISTS (SELECT 1 FROM omw_system_initialization) OR EXISTS (SELECT 1 FROM omw_user WHERE is_admin = true)`).Scan(&initialized).Error
	return initialized, err
}

type SystemInitializationRepository struct{ *Store }
