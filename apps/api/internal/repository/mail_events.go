package repository

import (
	"context"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
)

// Changed is an invalidation hint; durable rows are the source of truth after reconnect.
func (r *MailEventsRepository) Changed(ctx context.Context, userID int64) {
	if r.rdb != nil {
		_ = r.rdb.Publish(ctx, mailEventChannel(userID), "changed").Err()
	}
}

func (r *MailEventsRepository) Subscribe(ctx context.Context, userID int64) (<-chan *MailEvent, func() error, error) {
	if r.rdb == nil {
		return nil, nil, maildomain.ErrUnavailable
	}
	subscriber := r.rdb.Subscribe(ctx, mailEventChannel(userID))
	if _, err := subscriber.Receive(ctx); err != nil {
		_ = subscriber.Close()
		return nil, nil, maildomain.ErrUnavailable
	}
	return subscriber.Channel(), subscriber.Close, nil
}

func (r *MailEventsRepository) AllowConnection(ctx context.Context, userID int64) (bool, error) {
	if r.rdb == nil {
		return true, nil
	}
	result, err := r.rdb.Eval(ctx, `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`, []string{mailEventChannel(userID) + ":attempts"}).Int()
	return result <= 10, err
}

type MailEventsRepository struct{ *Store }
