package repository

import "time"

type TodoRecord struct {
	ID        int64 `gorm:"primaryKey;autoIncrement:false"`
	UserID    int64
	CreatedAt time.Time
	UpdatedAt time.Time
}
