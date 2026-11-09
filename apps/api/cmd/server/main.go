package main

import (
	"fmt"
	"os"

	"github.com/devin/oh-my-workbench/api/internal/app"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
)

func main() {
	if len(os.Args) > 1 {
		var err error
		switch os.Args[1] {
		case "notes-key-import":
			err = app.PrepareNotesKeys(os.Stdin)
		case "notes-key-check":
			err = app.PrepareNotesKeys(nil)
		default:
			err = fmt.Errorf("未知命令: %s", os.Args[1])
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	os.Exit(logging.Run("api", app.Run))
}
