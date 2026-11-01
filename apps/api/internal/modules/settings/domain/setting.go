package domain

import (
	"errors"
	"time"
)

var ErrConflict = errors.New("配置已变更，请刷新后重试")

// Value is encoded and, when sensitive, encrypted by the setting's consumer.
type Setting struct {
	ID        int64 `gorm:"primaryKey;autoIncrement:false"`
	UserID    int64
	Key       string
	Value     []byte
	Version   int
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (Setting) TableName() string { return "omw_system_setting" }
