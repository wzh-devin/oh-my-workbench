package app

import (
	"context"
	"errors"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	noteservice "github.com/devin/oh-my-workbench/api/internal/service/notes"
	"github.com/devin/oh-my-workbench/api/migrations"
)

// PrepareNotesKeys initializes an empty database's keys and validates persisted key references.
func PrepareNotesKeys() error {
	conf := config.Get()
	db, pool, err := database.InitDatabase(&conf)
	if err != nil {
		return errors.New("记事本密钥预检无法连接数据库，请检查部署连接配置")
	}
	defer pool.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	if err := migrations.Up(ctx, pool); err != nil {
		return errors.New("记事本密钥预检无法完成数据库迁移，请检查数据库状态")
	}
	repos := repository.New(db, nil)
	return noteservice.PrepareKeys(ctx, repos)
}
