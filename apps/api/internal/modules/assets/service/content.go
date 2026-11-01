package service

import (
	"context"
	"errors"
	"fmt"
	"image"
	// DecodeConfig 依赖业务包注册格式，不能由测试中的编码器导入代劳。
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strings"
	"time"

	minio "github.com/minio/minio-go/v7"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 鉴权内容读取和预览格式限制；大文件始终以可寻址流交给 HTTP 层。
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
		recipe = assetdomain.RendererVersion
	}
	return s.OpenRendition(ctx, userID, id, recipe, download)
}

func (s *Service) OpenRendition(ctx context.Context, userID, id int64, recipe string, download bool) (Content, error) {
	e, b, c, err := s.repo.Content(ctx, userID, id)
	if err != nil {
		return Content{}, err
	}
	key, version, size, contentType, etag := b.ObjectKey, b.ObjectVersionID, b.SizeBytes, e.ContentType, b.Etag
	if recipe != "" {
		p, err := s.repo.Rendition(ctx, userID, b.ID, recipe, false, false)
		if err != nil || p.Status != "ready" {
			return Content{}, assetdomain.ErrNotFound
		}
		key, version, size, contentType, etag = p.ObjectKey, p.ObjectVersionID, p.SizeBytes, "application/pdf", "preview-"+assetdomain.FormatID(p.ID)
		if recipe == assetdomain.ThumbnailVersion {
			contentType = "image/webp"
			etag = "thumbnail-" + assetdomain.ThumbnailView(p).Version
			e.Name = "thumbnail.webp"
		}
	}
	client, err := s.storage(ctx, c)
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
		return Content{}, assetdomain.ErrNotFound
	}
	if !download && strings.HasPrefix(contentType, "image/") {
		if size > 32<<20 {
			return Content{}, fmt.Errorf("%w：图片预览最大 32 MiB", assetdomain.ErrInvalid)
		}
		dimensions, _, err := image.DecodeConfig(io.LimitReader(object, 1<<20))
		if err != nil {
			if errors.Is(err, image.ErrFormat) {
				return Content{}, fmt.Errorf("%w：图片格式不受支持，请下载原文件", assetdomain.ErrInvalid)
			}
			return Content{}, fmt.Errorf("%w：无法读取图片尺寸，请下载原文件", assetdomain.ErrInvalid)
		}
		if dimensions.Width <= 0 || dimensions.Height <= 0 {
			return Content{}, fmt.Errorf("%w：图片尺寸无效，请下载原文件", assetdomain.ErrInvalid)
		}
		if int64(dimensions.Width) > 50_000_000/int64(dimensions.Height) {
			return Content{}, fmt.Errorf("%w：图片尺寸超过预览限制", assetdomain.ErrInvalid)
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
