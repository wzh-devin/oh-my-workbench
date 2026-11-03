package repository

import (
	"context"
	"encoding/json"
	"errors"
	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"time"
)

type Passkey struct {
	UserID     int64  `gorm:"primaryKey;autoIncrement:false"`
	RPID       string `gorm:"primaryKey;column:rp_id"`
	UserHandle []byte
	Credential json.RawMessage `gorm:"type:jsonb"`
	Version    int
}

func (Passkey) TableName() string { return "omw_note_passkey" }
func (r *Repository) Passkey(ctx context.Context, user int64, rp string) (Passkey, error) {
	var out Passkey
	err := r.db.WithContext(ctx).Where("user_id=? AND rp_id=?", user, rp).First(&out).Error
	return out, missing(err)
}

// A revoked/replaced credential cannot be resurrected by an earlier in-flight ceremony.
func (r *Repository) SavePasskey(ctx context.Context, record Passkey, expected int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, record.UserID); err != nil {
			return err
		}
		var old Passkey
		err := tx.Where("user_id=? AND rp_id=?", record.UserID, record.RPID).First(&old).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if old.Version != expected {
			return d.ErrPasskeyChanged
		}
		record.Version = expected + 1
		return tx.Save(&record).Error
	})
}
func (r *Repository) DeletePasskey(ctx context.Context, user int64, rp string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := userLock(tx, user); err != nil {
			return err
		}
		return tx.Model(&Passkey{}).Where("user_id=? AND rp_id=?", user, rp).Updates(map[string]any{"credential": nil, "version": gorm.Expr("version+1")}).Error
	})
}
func (r *Repository) PutCeremony(ctx context.Context, key string, value []byte) error {
	return r.rdb.Set(ctx, "notes:webauthn:"+key, value, 2*time.Minute).Err()
}
func (r *Repository) TakeCeremony(ctx context.Context, key string) ([]byte, error) {
	value, err := r.rdb.GetDel(ctx, "notes:webauthn:"+key).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, d.ErrLocked
	}
	if err != nil {
		return nil, err
	}
	return value, nil
}
func (r *Repository) ReserveCeremony(ctx context.Context, key string) error {
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
