package idgen

import (
	"github.com/bwmarrin/snowflake"
	"github.com/devin/oh-my-workbench/api/internal/config"
	"sync"
)

// 整个进程共享一个生成器。
var node = sync.OnceValue(func() *snowflake.Node {
	cfg := config.Get()
	instance, err := snowflake.NewNode(cfg.WorkerID)
	if err != nil {
		panic(err)
	}
	return instance
})

func Next() int64 { return node().Generate().Int64() }
