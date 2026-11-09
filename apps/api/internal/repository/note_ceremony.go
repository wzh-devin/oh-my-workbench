package repository

import (
	"context"
	"errors"
	"time"

	redis "github.com/redis/go-redis/v9"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
)

func (r *NoteCeremonyRepository) PutCeremony(ctx context.Context, key string, value []byte) error {
	return r.rdb.Set(ctx, "notes:webauthn:"+key, value, 2*time.Minute).Err()
}

func (r *NoteCeremonyRepository) TakeCeremony(ctx context.Context, key string) ([]byte, error) {
	value, err := r.rdb.GetDel(ctx, "notes:webauthn:"+key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, notedomain.ErrLocked
	}
	if err != nil {
		return nil, err
	}
	return value, nil
}

func (r *NoteCeremonyRepository) ReserveCeremony(ctx context.Context, key string) error {
	// INCR plus expiration atomically, including the first attempt.
	n, err := r.rdb.Eval(ctx, `local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n`, []string{"notes:webauthn-limit:" + key}).Int()
	if err != nil {
		return err
	}
	if n > 20 {
		return authdomain.ErrRateLimited
	}
	return nil
}

type NoteCeremonyRepository struct{ *Store }
