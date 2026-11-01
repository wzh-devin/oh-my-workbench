package main

import (
	"os"

	"github.com/devin/oh-my-workbench/api/internal/app"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
)

func main() {
	os.Exit(logging.Run("api", app.Run))
}
