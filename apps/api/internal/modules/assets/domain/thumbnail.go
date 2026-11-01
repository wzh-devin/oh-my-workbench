package domain

import (
	"fmt"
	"path"
	"strings"
)

// 缩略图仅派生不可变内容，沿用预览缓存、租约和最后引用清理。
const (
	ThumbnailVersion = "thumbnail-512-v1"
	ThumbnailMaxSize = 2 << 20
)

type Thumbnail struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
}

// 固定支持范围；HTML 等源码只按纯文本处理，不执行页面或外部资源。
func ThumbnailSource(e Entry) string {
	if e.Kind != "file" || e.Size <= 0 {
		return ""
	}
	switch strings.Split(e.ContentType, ";")[0] {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		if e.Size <= 32<<20 {
			return e.ContentType
		}
	case "application/pdf":
		if e.Size <= 50<<20 {
			return "application/pdf"
		}
	case "video/quicktime", "video/mp4", "video/webm", "video/x-msvideo":
		if e.Size <= 100<<20 {
			return strings.Split(e.ContentType, ";")[0]
		}
	}
	if e.Size <= 50<<20 && OfficeFilename(e) != "" {
		return "office"
	}
	// 文本只取有界前缀，HTML/SVG源码不会交给浏览器或可执行格式加载器。
	if e.Size <= MaxFileSize {
		switch strings.ToLower(path.Ext(e.Name)) {
		case ".csv":
			return "text/csv"
		case ".tsv":
			return "text/tab-separated-values"
		case ".txt", ".md", ".json", ".toml", ".yaml", ".yml", ".xml", ".html", ".htm", ".log", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sh", ".sql", ".go", ".rs", ".java", ".ini", ".conf", ".env":
			return "text/plain"
		}
		if strings.HasPrefix(e.ContentType, "text/") {
			return "text/plain"
		}
	}
	return ""
}

func RenditionKey(c Connection, blobID int64, recipe string) string {
	filename := "preview-v1.pdf"
	if recipe == ThumbnailVersion {
		filename = "thumbnail-512-v1.webp"
	}
	return path.Join(c.Prefix, FormatID(c.UserID), FormatID(blobID), filename)
}

func ThumbnailView(p Preview) *Thumbnail {
	view := &Thumbnail{Status: p.Status}
	if p.Status == "ready" {
		view.Version = fmt.Sprintf("%d-%d", p.ID, p.UpdatedAt.UnixNano())
	}
	return view
}
