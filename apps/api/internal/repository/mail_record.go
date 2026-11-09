package repository

import (
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type MailRecord struct {
	ID        int64     `gorm:"primaryKey;autoIncrement:false" json:"id,string"`
	UserID    int64     `json:"-"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func NewMailRecord(userID int64) MailRecord {
	now := time.Now().UTC()
	return MailRecord{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}
}
