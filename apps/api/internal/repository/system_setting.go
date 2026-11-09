package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	settingsdomain "github.com/devin/oh-my-workbench/api/internal/domain/settings"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type SystemSetting struct {
	ID        int64 `gorm:"primaryKey;autoIncrement:false"`
	UserID    int64
	Key       string
	Value     []byte
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (SystemSetting) TableName() string { return "omw_system_setting" }

func (r *SystemSettingRepository) ProxyList(ctx context.Context, userID int64, services []string) ([]SystemSetting, error) {
	keys := make([]string, len(services))
	for i, service := range services {
		keys[i] = settingsdomain.ProxyKeyPrefix + service
	}
	return New(r.db, nil).SystemSetting.List(ctx, userID, keys)
}

func (r *SystemSettingRepository) ProxyGet(ctx context.Context, userID int64, service string) (SystemSetting, error) {
	return New(r.db, nil).SystemSetting.Get(ctx, userID, settingsdomain.ProxyKeyPrefix+service)
}

// Publish the setting and fence the old mailbox listeners in the same transaction.
func (r *SystemSettingRepository) ProxySave(ctx context.Context, userID int64, service string, ciphertext []byte, version int) (SystemSetting, error) {
	var record SystemSetting
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		record, err = New(tx, nil).SystemSetting.Save(ctx, userID, settingsdomain.ProxyKeyPrefix+service, ciphertext, version)
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

// user_id=0 是系统作用域；初始化发生在管理员创建前，不依赖用户行锁。
func (r *SystemSettingRepository) InitializeSystem(ctx context.Context, key string, value []byte) (SystemSetting, error) {
	now := time.Now().UTC()
	record := SystemSetting{ID: idgen.Next(), UserID: 0, Key: key, Value: value, Version: 1, CreatedAt: now, UpdatedAt: now}
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "key"}}, DoNothing: true,
	}).Create(&record).Error
	if err != nil {
		return SystemSetting{}, err
	}
	return r.Get(ctx, 0, key)
}

func (r *SystemSettingRepository) SaveSystem(ctx context.Context, value []byte, version int) (SystemSetting, error) {
	result := r.db.WithContext(ctx).Model(&SystemSetting{}).
		Where("user_id = 0 AND key = ? AND version = ?", settingsdomain.SystemKey, version).
		Updates(map[string]any{"value": value, "version": version + 1, "updated_at": time.Now().UTC()})
	if result.Error != nil {
		return SystemSetting{}, result.Error
	}
	if result.RowsAffected != 1 {
		return SystemSetting{}, settingsdomain.ErrConflict
	}
	return r.Get(ctx, 0, settingsdomain.SystemKey)
}

func (r *SystemSettingRepository) List(ctx context.Context, userID int64, keys []string) ([]SystemSetting, error) {
	var records []SystemSetting
	err := r.db.WithContext(ctx).Where("user_id = ? AND key IN ?", userID, keys).Find(&records).Error
	return records, err
}

func (r *SystemSettingRepository) Get(ctx context.Context, userID int64, key string) (SystemSetting, error) {
	var record SystemSetting
	err := r.db.WithContext(ctx).Where("user_id = ? AND key = ?", userID, key).Find(&record).Error
	return record, err
}

// The owner lock serializes edits, including concurrent first saves with version zero.
func (r *SystemSettingRepository) Save(ctx context.Context, userID int64, key string, value []byte, version int) (SystemSetting, error) {
	var record SystemSetting
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var owner struct{ ID int64 }
		if err := tx.Table("omw_user").Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", userID).First(&owner).Error; err != nil {
			return err
		}
		err := tx.Where("user_id = ? AND key = ?", userID, key).First(&record).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if record.Version != version {
			return settingsdomain.ErrConflict
		}
		now := time.Now().UTC()
		if record.ID == 0 {
			record = SystemSetting{ID: idgen.Next(), UserID: userID, Key: key, CreatedAt: now}
		}
		record.Value, record.Version, record.UpdatedAt = value, version+1, now
		return tx.Save(&record).Error
	})
	return record, err
}

type SystemSettingRepository struct{ *Store }
