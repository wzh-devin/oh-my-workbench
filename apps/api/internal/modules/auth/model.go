package auth

import "time"

const StatusActive = "active"

type User struct {
	ID          int64  `gorm:"type:bigint;autoIncrement:false;index:idx_users_id"`
	Username    string `gorm:"type:varchar(64);index:idx_users_username"`
	Email       string `gorm:"type:varchar(256);index:idx_users_email"`
	Password    string `gorm:"column:password;type:text" json:"-"`
	DisplayName string `gorm:"type:varchar(64)"`
	IsAdmin     bool
	Status      string    `gorm:"type:varchar(16)"`
	LastLoginAt time.Time `gorm:"type:timestamptz"`
	CreatedAt   time.Time `gorm:"type:timestamptz"`
	UpdatedAt   time.Time `gorm:"type:timestamptz"`
}

func (User) TableName() string { return "omw_user" }

type Initialization struct {
	ID          int64     `gorm:"type:bigint;autoIncrement:false;index:idx_omw_system_initialization_id"`
	AdminUserID int64     `gorm:"type:bigint"`
	CreatedAt   time.Time `gorm:"type:timestamptz"`
	UpdatedAt   time.Time `gorm:"type:timestamptz"`
}

func (Initialization) TableName() string { return "omw_system_initialization" }
