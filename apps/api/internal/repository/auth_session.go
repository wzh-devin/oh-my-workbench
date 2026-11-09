package repository

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"

	redis "github.com/redis/go-redis/v9"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/auth"
)

func (r *AuthSessionRepository) LoginFailures(ctx context.Context, username string) (int, error) {
	count, err := r.rdb.Get(ctx, authFailureKey(username)).Int()
	if errors.Is(err, redis.Nil) {
		return 0, nil
	}
	return count, err
}

func (r *AuthSessionRepository) RecordFailure(ctx context.Context, username string) error {
	return authRecordFailure.Run(ctx, r.rdb, []string{authFailureKey(username)}).Err()
}

func (r *AuthSessionRepository) ClearFailures(ctx context.Context, username string) error {
	return r.rdb.Del(ctx, authFailureKey(username)).Err()
}

func (r *AuthSessionRepository) SaveSession(ctx context.Context, value string, user User) error {
	payload, err := json.Marshal(authdto.CachedSession{UserResponse: UserInfo(user), Version: user.SessionVersion})
	if err != nil {
		return err
	}
	return r.rdb.Set(ctx, authSessionKey(value), payload, authdomain.SessionDuration).Err()
}

func (r *AuthSessionRepository) SessionUser(ctx context.Context, value string) (authdto.CachedSession, error) {
	var user authdto.CachedSession
	cached, err := r.rdb.Get(ctx, authSessionKey(value)).Result()
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

func (r *AuthSessionRepository) DeleteSession(ctx context.Context, value string) error {
	return r.rdb.Del(ctx, authSessionKey(value)).Err()
}

// ReservePasswordAttempt 在校验密码前原子计数，限制并发猜测及哈希计算开销。
func (r *AuthSessionRepository) ReservePasswordAttempt(ctx context.Context, id int64) error {
	count, err := authRecordFailure.Run(ctx, r.rdb, []string{"auth:password-attempts:" + strconv.FormatInt(id, 10)}).Int()
	if err != nil {
		return err
	}
	if count > 10 {
		return authdomain.ErrRateLimited
	}
	return nil
}

type AuthSessionRepository struct{ *Store }
