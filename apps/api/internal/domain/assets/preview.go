package assets

import (
	"path/filepath"
	"strings"
)

const RendererVersion = "gotenberg-pdf-v1"

func OfficeName(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp":
		return true
	}
	return false
}
