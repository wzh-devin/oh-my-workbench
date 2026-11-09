package repository

import (
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type AssetBase struct {
	ID        int64     `json:"id,string" gorm:"primaryKey"`
	UserID    int64     `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func NewAssetBase(userID int64) AssetBase {
	now := time.Now().UTC()
	return AssetBase{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}
}
