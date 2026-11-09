package repository

import (
	"context"
	"encoding/json"
)

type AssetOperation struct {
	AssetBase
	ConnectionID int64           `json:"-"`
	Kind         string          `json:"kind"`
	Status       string          `json:"status"`
	RequestKey   string          `json:"requestKey"`
	Payload      json.RawMessage `json:"-" gorm:"type:jsonb"`
	// 旧客户端要求该响应字段；同步操作错误直接返回 HTTP，不再入库。
	LastError string `json:"error" gorm:"-"`
}

func (AssetOperation) TableName() string { return "omw_asset_operation" }

func (r *AssetOperationRepository) Operation(ctx context.Context, userID, id int64) (AssetOperation, error) {
	var op AssetOperation
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", userID, id).First(&op).Error
	return op, assetsMissing(err)
}

type AssetOperationRepository struct{ *Store }
