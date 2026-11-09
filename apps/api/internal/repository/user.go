package repository

import (
	"context"
	"time"

	"gorm.io/gorm"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type User struct {
	ID                       int64  `gorm:"type:bigint;autoIncrement:false;index:idx_users_id"`
	Username                 string `gorm:"type:varchar(64);index:idx_users_username"`
	Email                    string `gorm:"type:varchar(256);index:idx_users_email"`
	Password                 string `gorm:"column:password;type:text" json:"-"`
	SessionVersion           int64  `gorm:"not null;default:0" json:"-"`
	DisplayName              string `gorm:"type:varchar(64)"`
	IsAdmin                  bool
	MailNotificationsEnabled bool      `gorm:"default:true" json:"-"`
	Status                   string    `gorm:"type:varchar(16)"`
	LastLoginAt              time.Time `gorm:"type:timestamptz"`
	CreatedAt                time.Time `gorm:"type:timestamptz"`
	UpdatedAt                time.Time `gorm:"type:timestamptz"`
}

func (User) TableName() string { return "omw_user" }

func UserInfo(user User) authresp.UserResponse {
	return authresp.UserResponse{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		IsAdmin:     user.IsAdmin,
	}
}

func (r *UserRepository) GetByUsername(ctx context.Context, username string) (User, error) {
	var users []User
	if err := r.db.WithContext(ctx).Where("username = ?", username).Limit(2).Find(&users).Error; err != nil {
		return User{}, err
	}
	if len(users) == 0 {
		return User{}, authdomain.ErrCredentials
	}
	if len(users) != 1 {
		return User{}, authdomain.ErrIntegrity
	}
	return users[0], nil
}

func (r *UserRepository) GetByID(ctx context.Context, id int64) (User, error) {
	var user User
	result := r.db.WithContext(ctx).Where("id = ?", id).Limit(1).Find(&user)
	if result.Error != nil {
		return User{}, result.Error
	}
	if result.RowsAffected == 0 {
		return User{}, authdomain.ErrUnauthorized
	}
	return user, nil
}

func (r *UserRepository) RecordLogin(ctx context.Context, id int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&User{}).Where("id = ?", id).Updates(map[string]any{"last_login_at": now, "updated_at": now}).Error
}

// SaveUser 将管理员与初始化标记一起提交；表锁让多实例初始化同样只能成功一次。
func (r *UserRepository) SaveUser(ctx context.Context, username, hash string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE omw_system_initialization IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		initialized, err := New(tx, r.rdb).SystemInitialization.Initialized(ctx)
		if err != nil {
			return err
		}
		if initialized {
			return authdomain.ErrInitialized
		}
		var count int64
		if err := tx.Model(&User{}).Where("username = ?", username).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return authdomain.ErrUsername
		}
		now := time.Now()
		user := User{ID: idgen.Next(), Username: username, Password: hash, DisplayName: username, IsAdmin: true, Status: authdomain.UserStatusActive, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&SystemInitialization{ID: idgen.Next(), AdminUserID: user.ID, CreatedAt: now, UpdatedAt: now}).Error
	})
}

// ChangePassword 比较旧哈希并增加会话版本；并发修改只能提交一次。
func (r *UserRepository) ChangePassword(ctx context.Context, user User, hash string) error {
	result := r.db.WithContext(ctx).Model(&User{}).
		Where("id = ? AND password = ? AND session_version = ? AND status = ?", user.ID, user.Password, user.SessionVersion, authdomain.UserStatusActive).
		Updates(map[string]any{"password": hash, "session_version": gorm.Expr("session_version + 1"), "updated_at": time.Now()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return authdomain.ErrPasswordConflict
	}
	return nil
}

// NotificationsEnabled独立读取偏好，不附带邮件列表或统计。
func (r *UserRepository) NotificationsEnabled(ctx context.Context, userID int64) (bool, error) {
	var enabled bool
	err := r.db.WithContext(ctx).Table("omw_user").Select("mail_notifications_enabled").Where("id=?", userID).Scan(&enabled).Error
	return enabled, err
}

func (r *UserRepository) SetNotifications(ctx context.Context, userID int64, enabled bool) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("omw_user").Where("id = ?", userID).Update("mail_notifications_enabled", enabled).Error; err != nil {
			return err
		}
		if !enabled {
			return tx.Model(&MailPushDelivery{}).Where("user_id = ? AND status IN ?", userID, []string{"queued", "running"}).Updates(map[string]any{"status": "canceled", "lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
		}
		return nil
	})
}

type UserRepository struct{ *Store }
