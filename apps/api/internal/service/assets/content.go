package assets

import (
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"strings"

	minio "github.com/minio/minio-go/v7"
	_ "golang.org/x/image/bmp"
	_ "golang.org/x/image/webp"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// OpenContent 每个 Range 请求都重查条目，不以 Blob ID 或远程 URL 绕过可见性。
func (s *Service) OpenContent(ctx context.Context, userID, id int64, preview, download bool) (assetdto.Content, error) {
	recipe := ""
	if preview {
		recipe = assetdomain.RendererVersion
	}
	return s.OpenRendition(ctx, userID, id, recipe, download)
}

func (s *Service) OpenRendition(ctx context.Context, userID, id int64, recipe string, download bool) (assetdto.Content, error) {
	e, b, c, err := s.repo.AssetEntry.Content(ctx, userID, id)
	if err != nil {
		return assetdto.Content{}, err
	}
	key, version, size, contentType, etag := b.ObjectKey, b.ObjectVersionID, b.SizeBytes, e.ContentType, b.Etag
	if recipe != "" {
		p, err := s.repo.AssetPreview.Rendition(ctx, userID, b.ID, recipe, false, false)
		if err != nil || p.Status != "ready" {
			return assetdto.Content{}, assetdomain.ErrNotFound
		}
		key, version, size, contentType, etag = p.ObjectKey, p.ObjectVersionID, p.SizeBytes, "application/pdf", "preview-"+assetdomain.FormatID(p.ID)
		if recipe == assetdomain.ThumbnailVersion {
			contentType = "image/webp"
			etag = "thumbnail-" + repository.AssetThumbnailView(p).Version
			e.Name = "thumbnail.webp"
		}
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return assetdto.Content{}, err
	}
	object, err := client.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{VersionID: version})
	if err != nil {
		return assetdto.Content{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = object.Close()
		}
	}()
	if _, err = object.Stat(); err != nil {
		return assetdto.Content{}, assetdomain.ErrNotFound
	}
	if !download && strings.HasPrefix(contentType, "image/") {
		if size > 32<<20 {
			return assetdto.Content{}, fmt.Errorf("%w：图片预览最大 32 MiB", assetdomain.ErrInvalid)
		}
		dimensions, _, err := image.DecodeConfig(io.LimitReader(object, 1<<20))
		if err != nil {
			if errors.Is(err, image.ErrFormat) {
				return assetdto.Content{}, fmt.Errorf("%w：图片格式不受支持，请下载原文件", assetdomain.ErrInvalid)
			}
			return assetdto.Content{}, fmt.Errorf("%w：无法读取图片尺寸，请下载原文件", assetdomain.ErrInvalid)
		}
		if dimensions.Width <= 0 || dimensions.Height <= 0 {
			return assetdto.Content{}, fmt.Errorf("%w：图片尺寸无效，请下载原文件", assetdomain.ErrInvalid)
		}
		if int64(dimensions.Width) > 50_000_000/int64(dimensions.Height) {
			return assetdto.Content{}, fmt.Errorf("%w：图片尺寸超过预览限制", assetdomain.ErrInvalid)
		}
		if _, err = object.Seek(0, io.SeekStart); err != nil {
			return assetdto.Content{}, err
		}
	}
	if strings.Contains(contentType, "html") || strings.Contains(contentType, "svg") || (!strings.HasPrefix(contentType, "image/") && !strings.HasPrefix(contentType, "audio/") && !strings.HasPrefix(contentType, "video/") && contentType != "application/pdf") {
		contentType = "text/plain; charset=utf-8"
	}
	if download {
		contentType = "application/octet-stream"
	}
	config, err := s.storageConfig(c)
	if err != nil {
		return assetdto.Content{}, err
	}
	success = true
	return assetdto.Content{Reader: object, Name: e.Name, Type: contentType, ETag: etag, Size: size, ModifiedAt: b.CreatedAt,
		ConnectionID: c.ID, ConnectionVersion: c.Version, PublicEndpoint: c.PublicEndpoint, Storage: config, ObjectKey: key, ObjectVersionID: version}, nil
}
