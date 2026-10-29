package database

import (
	"database/sql"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func InitDatabase(conf *config.Config) (*gorm.DB, *sql.DB, error) {
	db, err := gorm.Open(postgres.Open(conf.DatabaseURL), &gorm.Config{
		DisableAutomaticPing: true,
		Logger:               logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		return nil, nil, err
	}
	pool, err := db.DB()
	if err != nil {
		return nil, nil, err
	}
	pool.SetMaxOpenConns(10)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxLifetime(30 * time.Minute)
	return db, pool, nil
}
