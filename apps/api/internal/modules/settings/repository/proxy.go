package repository

import (
	"context"
	"time"

	"gorm.io/gorm"

	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
)

type ProxyRepository struct{ db *gorm.DB }

func NewProxyRepository(db *gorm.DB) *ProxyRepository { return &ProxyRepository{db: db} }

func (r *ProxyRepository) List(ctx context.Context, userID int64, services []string) ([]settingsdomain.Setting, error) {
	keys := make([]string, len(services))
	for i, service := range services {
		keys[i] = settingsdomain.ProxyKeyPrefix + service
	}
	return NewRepository(r.db).List(ctx, userID, keys)
}

func (r *ProxyRepository) Get(ctx context.Context, userID int64, service string) (settingsdomain.Setting, error) {
	return NewRepository(r.db).Get(ctx, userID, settingsdomain.ProxyKeyPrefix+service)
}

// Publish the setting and fence the old mailbox listeners in the same transaction.
func (r *ProxyRepository) Save(ctx context.Context, userID int64, service string, ciphertext []byte, version int) (settingsdomain.Setting, error) {
	var record settingsdomain.Setting
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		record, err = NewRepository(tx).Save(ctx, userID, settingsdomain.ProxyKeyPrefix+service, ciphertext, version)
		if err != nil {
			return err
		}
		provider := ""
		if service == outbound.QQ {
			provider = "QQ"
		}
		if service == outbound.Gmail {
			provider = "Gmail"
		}
		if provider != "" {
			return tx.Table("omw_mail_account").Where("user_id = ? AND provider = ?", userID, provider).
				Updates(map[string]any{"lease_token": nil, "lease_until": nil, "updated_at": time.Now().UTC()}).Error
		}
		return nil
	})
	return record, err
}
