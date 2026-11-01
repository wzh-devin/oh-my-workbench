package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Repository struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewRepository(db *gorm.DB, rdb *redis.Client) *Repository { return &Repository{db: db, rdb: rdb} }

func (r *Repository) Initialized(ctx context.Context) (bool, error) {
	var initialized bool
	err := r.db.WithContext(ctx).Raw(`SELECT EXISTS (SELECT 1 FROM omw_system_initialization) OR EXISTS (SELECT 1 FROM omw_user WHERE is_admin = true)`).Scan(&initialized).Error
	return initialized, err
}

func (r *Repository) GetByUsername(ctx context.Context, username string) (authdomain.User, error) {
	var users []authdomain.User
	if err := r.db.WithContext(ctx).Where("username = ?", username).Limit(2).Find(&users).Error; err != nil {
		return authdomain.User{}, err
	}
	if len(users) == 0 {
		return authdomain.User{}, authdomain.ErrCredentials
	}
	if len(users) != 1 {
		return authdomain.User{}, authdomain.ErrIntegrity
	}
	return users[0], nil
}

func (r *Repository) GetByID(ctx context.Context, id int64) (authdomain.User, error) {
	var user authdomain.User
	result := r.db.WithContext(ctx).Where("id = ?", id).Limit(1).Find(&user)
	if result.Error != nil {
		return authdomain.User{}, result.Error
	}
	if result.RowsAffected == 0 {
		return authdomain.User{}, authdomain.ErrUnauthorized
	}
	return user, nil
}

func (r *Repository) RecordLogin(ctx context.Context, id int64) error {
	now := time.Now()
	return r.db.WithContext(ctx).Model(&authdomain.User{}).Where("id = ?", id).Updates(map[string]any{"last_login_at": now, "updated_at": now}).Error
}

// SaveUser 将管理员与初始化标记一起提交；表锁让多实例初始化同样只能成功一次。
func (r *Repository) SaveUser(ctx context.Context, username, hash string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE omw_system_initialization IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		initialized, err := NewRepository(tx, r.rdb).Initialized(ctx)
		if err != nil {
			return err
		}
		if initialized {
			return authdomain.ErrInitialized
		}
		var count int64
		if err := tx.Model(&authdomain.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return authdomain.ErrUsername
		}
		now := time.Now()
		user := authdomain.User{ID: idgen.Next(), Username: username, Password: hash, DisplayName: username, IsAdmin: true, Status: authdomain.UserStatusActive, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&authdomain.Initialization{ID: idgen.Next(), AdminUserID: user.ID, CreatedAt: now, UpdatedAt: now}).Error
	})
}

var recordFailure = redis.NewScript(`local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n`)

func sessionKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return authdomain.RedisSessionKey + ":" + hex.EncodeToString(sum[:])
}

func failureKey(username string) string { return "auth:failures:" + sessionKey(username) }

func (r *Repository) LoginFailures(ctx context.Context, username string) (int, error) {
	count, err := r.rdb.Get(ctx, failureKey(username)).Int()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return count, err
}

func (r *Repository) RecordFailure(ctx context.Context, username string) error {
	return recordFailure.Run(ctx, r.rdb, []string{failureKey(username)}).Err()
}

func (r *Repository) ClearFailures(ctx context.Context, username string) error {
	return r.rdb.Del(ctx, failureKey(username)).Err()
}

func (r *Repository) SaveSession(ctx context.Context, value string, user authdomain.User) error {
	payload, err := json.Marshal(authdomain.CachedSession{UserInfo: authdomain.ToUserInfo(user), Version: user.SessionVersion})
	if err != nil {
		return err
	}
	return r.rdb.Set(ctx, sessionKey(value), payload, authdomain.SessionDuration).Err()
}

func (r *Repository) SessionUser(ctx context.Context, value string) (authdomain.CachedSession, error) {
	var user authdomain.CachedSession
	cached, err := r.rdb.Get(ctx, sessionKey(value)).Result()
	if errors.Is(err, redis.Nil) {
		return user, authdomain.ErrUnauthorized
	}
	if err != nil {
		return user, err
	}
	if json.Unmarshal([]byte(cached), &user) != nil {
		return user, authdomain.ErrUnauthorized
	}
	return user, nil
}

func (r *Repository) DeleteSession(ctx context.Context, value string) error {
	return r.rdb.Del(ctx, sessionKey(value)).Err()
}
