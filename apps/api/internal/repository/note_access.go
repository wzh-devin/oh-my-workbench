package repository

import (
	"context"
	"time"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
)

func (r *NoteAccessRepository) Unlocked(ctx context.Context, user int64, session string) (bool, error) {
	if session == "" {
		return false, nil
	}
	n, err := r.rdb.Exists(ctx, notesUnlockKey(user, session)).Result()
	return n == 1, err
}

func (r *NoteAccessRepository) Unlock(ctx context.Context, user int64, session string) error {
	if session == "" {
		return notedomain.ErrInvalid
	}
	return r.rdb.Set(ctx, notesUnlockKey(user, session), "1", 5*time.Minute).Err()
}

func (r *NoteAccessRepository) Lock(ctx context.Context, user int64, session string) error {
	return r.rdb.Del(ctx, notesUnlockKey(user, session)).Err()
}

func (r *NoteAccessRepository) UnlockExpiry(ctx context.Context, user int64, session string) (time.Time, error) {
	ttl, err := r.rdb.PTTL(ctx, notesUnlockKey(user, session)).Result()
	if err != nil {
		return time.Time{}, err
	}
	if ttl <= 0 {
		return time.Time{}, notedomain.ErrLocked
	}
	return time.Now().UTC().Add(ttl), nil
}

type NoteAccessRepository struct{ *Store }
