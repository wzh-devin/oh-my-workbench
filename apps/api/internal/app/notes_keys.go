package app

import (
	"context"
	"errors"
	"io"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	noteservice "github.com/devin/oh-my-workbench/api/internal/service/notes"
	"github.com/devin/oh-my-workbench/api/migrations"
)

// PrepareNotesKeys validates database keys, or imports an original keyring from standard input.
func PrepareNotesKeys(input io.Reader) error {
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
	if input != nil {
		return noteservice.ImportKeys(ctx, repos, input)
	}
	return noteservice.PrepareKeys(ctx, repos)
}
