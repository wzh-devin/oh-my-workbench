package database

import (
	"database/sql"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func InitDatabase(conf *config.Config) (*gorm.DB, *sql.DB, error) {
	connection, err := pgx.ParseConfig(conf.DatabaseURL)
	if err != nil {
		return nil, nil, err
	}
	connection.Tracer = logging.SQLTracer{}
	pool := stdlib.OpenDB(*connection)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: pool}), &gorm.Config{
		DisableAutomaticPing: true,
		Logger:               logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		_ = pool.Close()
		return nil, nil, err
	}
	pool.SetMaxOpenConns(10)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxLifetime(30 * time.Minute)
	return db, pool, nil
}
