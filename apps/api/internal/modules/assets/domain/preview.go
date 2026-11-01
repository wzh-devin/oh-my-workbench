package domain

import (
	"path/filepath"
	"strings"
)

// Office 仅送入工作台私有转换器，产物按不可变内容和渲染版本复用。
const RendererVersion = "gotenberg-pdf-v1"

func OfficeName(name string) bool {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".ods", ".odp":
		return true
	}
	return false
}

// 改名不改变内容类型，已识别Office即使改掉扩展名仍可复用预览。
func OfficeFilename(e Entry) string {
	extension := map[string]string{
		"application/msword":            ".doc",
		"application/vnd.ms-excel":      ".xls",
		"application/vnd.ms-powerpoint": ".ppt",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   ".docx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         ".xlsx",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
		"application/vnd.oasis.opendocument.text":                                   ".odt",
		"application/vnd.oasis.opendocument.spreadsheet":                            ".ods",
		"application/vnd.oasis.opendocument.presentation":                           ".odp",
	}[e.ContentType]
	if extension != "" {
		if strings.EqualFold(filepath.Ext(e.Name), extension) {
			return e.Name
		}
		return e.Name + extension
	}
	if OfficeName(e.Name) {
		return e.Name
	}
	return ""
}
