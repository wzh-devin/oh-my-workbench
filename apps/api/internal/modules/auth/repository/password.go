package repository

import (
	"context"
	"strconv"
	"time"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	"gorm.io/gorm"
)

// ReservePasswordAttempt 在校验密码前原子计数，限制并发猜测及哈希计算开销。
func (r *Repository) ReservePasswordAttempt(ctx context.Context, id int64) error {
	count, err := recordFailure.Run(ctx, r.rdb, []string{"auth:password-attempts:" + strconv.FormatInt(id, 10)}).Int()
	if err != nil {
		return err
	}
	if count > 10 {
		return authdomain.ErrRateLimited
	}
	return nil
}

// ChangePassword 比较旧哈希并增加会话版本；并发修改只能提交一次。
func (r *Repository) ChangePassword(ctx context.Context, user authdomain.User, hash string) error {
	result := r.db.WithContext(ctx).Model(&authdomain.User{}).
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
