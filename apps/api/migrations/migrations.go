package migrations

import (
	"context"
	"database/sql"
	"embed"
	"fmt"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var files embed.FS

func Up(ctx context.Context, db *sql.DB) error {
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		return fmt.Errorf("创建数据库迁移锁失败: %w", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithSessionLocker(locker))
	if err != nil {
		return fmt.Errorf("初始化数据库迁移失败: %w", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return fmt.Errorf("执行数据库迁移失败: %w", err)
	}
	return nil
}
