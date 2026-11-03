package app

import (
	"context"
	"errors"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	noterepo "github.com/devin/oh-my-workbench/api/internal/modules/notes/repository"
	noteservice "github.com/devin/oh-my-workbench/api/internal/modules/notes/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/migrations"
)

// PrepareNotesKeys is a deployment preflight, before replacing the running application.
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
	return noteservice.PrepareKeys(ctx, noterepo.NewRepository(db, nil), noteservice.KeyFile)
}
