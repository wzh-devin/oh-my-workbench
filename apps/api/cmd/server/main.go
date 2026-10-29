package main

import (
	"log"

	"github.com/devin/oh-my-workbench/api/internal/app"
)

func main() {
	// 启动函数
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
