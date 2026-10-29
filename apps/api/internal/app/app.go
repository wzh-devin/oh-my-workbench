package app

import (
	"context"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/devin/oh-my-workbench/api/internal/platform/cache"
	"github.com/devin/oh-my-workbench/api/internal/platform/database"
	"github.com/devin/oh-my-workbench/api/migrations"
)

func Run() error {
	conf := config.Get()
	db, pool, err := database.InitDatabase(&conf)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := migrations.Up(context.Background(), pool); err != nil {
		return err
	}
	rdb, err := cache.InitRedis(&conf)
	if err != nil {
		return err
	}
	defer rdb.Close()
	r := newRouter(db, rdb)
	return r.Run(conf.HTTPAddr)
}
