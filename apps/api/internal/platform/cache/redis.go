package cache

import (
	"time"

	"github.com/devin/oh-my-workbench/api/internal/config"
	"github.com/redis/go-redis/v9"
)

func InitRedis(conf *config.Config) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:                  conf.RedisAddr,
		Password:              conf.RedisPassword,
		ContextTimeoutEnabled: true,
		DialTimeout:           2 * time.Second,
		ReadTimeout:           2 * time.Second,
		WriteTimeout:          2 * time.Second,
	})
	return client, nil
}
