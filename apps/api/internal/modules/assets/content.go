// 鉴权内容读取和预览格式限制；大文件始终以可寻址流交给 HTTP 层。
package assets

import (
	"context"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"
)

type Content struct {
	Reader           *minio.Object
	Name, Type, ETag string
	Size             int64
	ModifiedAt       time.Time
}

// OpenContent 每个 Range 请求都重查条目，不以 Blob ID 或远程 URL 绕过可见性。
func (s *Service) OpenContent(ctx context.Context, userID, id int64, preview, download bool) (Content, error) {
	recipe := ""
	if preview {
		recipe = rendererVersion
	}
	return s.openContent(ctx, userID, id, recipe, download)
}

func (s *Service) openContent(ctx context.Context, userID, id int64, recipe string, download bool) (Content, error) {
	e, b, c, err := s.repo.Content(ctx, userID, id)
	if err != nil {
		return Content{}, err
	}
	key, version, size, contentType, etag := b.ObjectKey, b.ObjectVersionID, b.SizeBytes, e.ContentType, b.Etag
	if recipe != "" {
		p, err := s.repo.rendition(ctx, userID, b.ID, recipe, false, false)
		if err != nil || p.Status != "ready" {
			return Content{}, ErrNotFound
		}
		key, version, size, contentType, etag = p.ObjectKey, p.ObjectVersionID, p.SizeBytes, "application/pdf", "preview-"+formatID(p.ID)
		if recipe == thumbnailVersion {
			contentType = "image/webp"
			etag = "thumbnail-" + thumbnailView(p).Version
			e.Name = "thumbnail.webp"
		}
	}
	client, err := s.storage(c)
	if err != nil {
		return Content{}, err
	}
	object, err := client.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{VersionID: version})
	if err != nil {
		return Content{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = object.Close()
		}
	}()
	if _, err = object.Stat(); err != nil {
		return Content{}, ErrNotFound
	}
	if !download && strings.HasPrefix(contentType, "image/") {
		if size > 32<<20 {
			return Content{}, fmt.Errorf("%w：图片预览最大 32 MiB", ErrInvalid)
		}
		dimensions, _, err := image.DecodeConfig(io.LimitReader(object, 1<<20))
		if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 || int64(dimensions.Width) > 50_000_000/int64(dimensions.Height) {
			return Content{}, fmt.Errorf("%w：图片尺寸超过预览限制", ErrInvalid)
		}
		if _, err = object.Seek(0, io.SeekStart); err != nil {
			return Content{}, err
		}
	}
	if strings.Contains(contentType, "html") || strings.Contains(contentType, "svg") || (!strings.HasPrefix(contentType, "image/") && !strings.HasPrefix(contentType, "audio/") && !strings.HasPrefix(contentType, "video/") && contentType != "application/pdf") {
		contentType = "text/plain; charset=utf-8"
	}
	if download {
		contentType = "application/octet-stream"
	}
	success = true
	return Content{Reader: object, Name: e.Name, Type: contentType, ETag: etag, Size: size, ModifiedAt: b.CreatedAt}, nil
}
