package repository

import (
	"context"
	"time"

	"gorm.io/gorm/clause"

	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

// user_id=0 是系统作用域；初始化发生在管理员创建前，不依赖用户行锁。
func (r *Repository) InitializeSystem(ctx context.Context, value []byte) (settingsdomain.Setting, error) {
	now := time.Now().UTC()
	record := settingsdomain.Setting{ID: idgen.Next(), UserID: 0, Key: settingsdomain.SystemKey, Value: value, Version: 1, CreatedAt: now, UpdatedAt: now}
	err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}, {Name: "key"}}, DoNothing: true,
	}).Create(&record).Error
	if err != nil {
		return settingsdomain.Setting{}, err
	}
	return r.Get(ctx, 0, settingsdomain.SystemKey)
}

func (r *Repository) SaveSystem(ctx context.Context, value []byte, version int) (settingsdomain.Setting, error) {
	result := r.db.WithContext(ctx).Model(&settingsdomain.Setting{}).
		Where("user_id = 0 AND key = ? AND version = ?", settingsdomain.SystemKey, version).
		Updates(map[string]any{"value": value, "version": version + 1, "updated_at": time.Now().UTC()})
	if result.Error != nil {
		return settingsdomain.Setting{}, result.Error
	}
	if result.RowsAffected != 1 {
		return settingsdomain.Setting{}, settingsdomain.ErrConflict
	}
	return r.Get(ctx, 0, settingsdomain.SystemKey)
}
