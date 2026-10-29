package auth

import (
	"context"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
	"gorm.io/gorm"
)

const (
	UserStatusActive   = "active"
	UserStatusInactive = "inactive"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Initialized(ctx context.Context) (bool, error) {
	var initialized bool
	err := r.db.WithContext(ctx).Raw(`SELECT EXISTS (SELECT 1 FROM omw_system_initialization) OR EXISTS (SELECT 1 FROM omw_user WHERE is_admin = true)`).Scan(&initialized).Error
	return initialized, err
}

func (r *Repository) GetByUsername(ctx context.Context, username string) (User, error) {
	var users []User
	if err := r.db.WithContext(ctx).Where("username = ?", username).Limit(2).Find(&users).Error; err != nil {
		return User{}, err
	}
	if len(users) == 0 {
		return User{}, ErrCredentials
	}
	if len(users) != 1 {
		return User{}, ErrIntegrity
	}
	return users[0], nil
}

func (r *Repository) GetByID(ctx context.Context, id int64) (User, error) {
	var user User
	result := r.db.WithContext(ctx).Where("id = ?", id).Limit(1).Find(&user)
	if result.Error != nil {
		return User{}, result.Error
	}
	if result.RowsAffected == 0 {
		return User{}, ErrUnauthorized
	}
	return user, nil
}

func (r *Repository) RecordLogin(ctx context.Context, id int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(map[string]any{"last_login_at": now, "updated_at": now}).Error
}

// SaveUser 将管理员与初始化标记一起提交；表锁让多实例初始化同样只能成功一次。
func (r *Repository) SaveUser(ctx context.Context, username, hash string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE omw_system_initialization IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		initialized, err := NewRepository(tx).Initialized(ctx)
		if err != nil {
			return err
		}
		if initialized {
			return ErrInitialized
		}
		var count int64
		if err := tx.Model(&User{}).Where("username = ?", username).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return ErrUsername
		}
		now := time.Now()
		user := User{ID: idgen.Next(), Username: username, Password: hash, DisplayName: username, IsAdmin: true, Status: UserStatusActive, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&Initialization{ID: idgen.Next(), AdminUserID: user.ID, CreatedAt: now, UpdatedAt: now}).Error
	})
}
