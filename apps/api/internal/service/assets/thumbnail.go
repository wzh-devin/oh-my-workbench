package assets

import (
	"bytes"
	"context"
	"errors"
	"image"
	"io"
	"net/http"
	"strings"
	"time"

	minio "github.com/minio/minio-go/v7"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// 缩略图仅派生不可变内容，沿用预览缓存、租约和最后引用清理。
// Thumbnail 显式重试沿用文件权限；后台补齐不会反复重置失败记录。
func (s *Service) Thumbnail(ctx context.Context, userID, id int64) (*assetdto.Thumbnail, error) {
	e, b, _, err := s.repo.AssetEntry.Content(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	if repository.AssetThumbnailSource(e) == "" {
		return nil, assetdomain.ErrInvalid
	}
	if repository.AssetThumbnailSource(e) == "office" {
		if _, err := s.repo.AssetPreview.Rendition(ctx, userID, b.ID, assetdomain.RendererVersion, true, true); err != nil {
			return nil, err
		}
	}
	p, err := s.repo.AssetPreview.Rendition(ctx, userID, b.ID, assetdomain.ThumbnailVersion, true, true)
	return repository.AssetThumbnailView(p), err
}

func (s *Service) rendererAvailable(ctx context.Context, userID int64, suffix string) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	address, err := s.converterBase(ctx)
	if err != nil {
		return false
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address+suffix, nil)
	if err != nil {
		return false
	}
	gateway, err := s.converterHTTPClient(ctx, userID)
	if err != nil {
		return false
	}
	response, err := gateway.Do(request)
	if err != nil {
		return false
	}
	response.Body.Close()
	return response.StatusCode == http.StatusOK
}

func (s *Service) renderThumbnail(ctx context.Context, preview repository.AssetPreview) error {
	p, e, err := s.repo.AssetPreview.ClaimPreview(ctx, preview)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	finish := func(size int64, version, message string, failure repository.AssetsPreviewFailure) error {
		saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		return s.repo.AssetPreview.FinishPreviewResult(saveCtx, p, size, version, message, failure)
	}
	sourceType := repository.AssetThumbnailSource(e)
	if sourceType == "" {
		return finish(0, "", "该文件暂不支持缩略图", repository.AssetsPreviewFailed)
	}
	b, err := s.repo.AssetBlob.Blob(ctx, p.UserID, p.BlobID)
	if err != nil {
		return err
	}
	c, err := s.repo.AssetConnection.Connection(ctx, p.UserID, b.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return finish(0, "", "暂时无法读取存储", repository.AssetsPreviewRetry)
	}
	// 旧文件保留Key和旧版本；复制结果不确定时保留租约，避免清理早于远端提交。
	if info, err := client.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID}); err == nil && info.Size == b.SizeBytes && info.ETag == b.Etag && info.ContentType != e.ContentType {
		updated, err := client.ContentMetadata(ctx, c.Bucket, b.ObjectKey, info, e.ContentType)
		if err == nil {
			if err := s.repo.AssetBlob.UpdateBlobMetadata(ctx, b, updated.VersionID, updated.ETag); err == nil {
				b.ObjectVersionID, b.Etag = updated.VersionID, updated.ETag
			}
		} else if status := minio.ToErrorResponse(err).StatusCode; status < 400 || status >= 500 {
			return finish(0, "", "保存原件类型中断，将自动重试", repository.AssetsPreviewWriteUnknown)
		}
	}
	// 响应丢失或进程重启时直接找回完整产物，避免再次转换。
	if info, err := client.StatObject(ctx, c.Bucket, p.ObjectKey, minio.StatObjectOptions{}); err == nil && info.ContentType == "image/webp" && info.Size > 0 && info.Size <= assetdomain.ThumbnailMaxSize {
		return finish(info.Size, info.VersionID, "", repository.AssetsPreviewRetry)
	}
	key, version := b.ObjectKey, b.ObjectVersionID
	if sourceType == "office" {
		pdf, err := s.repo.AssetPreview.Rendition(ctx, p.UserID, p.BlobID, assetdomain.RendererVersion, true, false)
		if err != nil {
			return finish(0, "", "读取文档预览失败", repository.AssetsPreviewRetry)
		}
		if pdf.Status == "failed" {
			return finish(0, "", "文档转换失败，可重试或下载原文件", repository.AssetsPreviewFailed)
		}
		if pdf.Status != "ready" {
			return s.repo.AssetPreview.DeferPreview(ctx, p)
		}
		key, version, sourceType = pdf.ObjectKey, pdf.ObjectVersionID, "application/pdf"
	}
	source, err := client.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{VersionID: version})
	if err != nil {
		return finish(0, "", "读取原文件失败", repository.AssetsPreviewRetry)
	}
	defer source.Close()
	limit := int64(100<<20 + 1)
	if strings.HasPrefix(sourceType, "text/") {
		limit = 512 << 10
	}
	address, err := s.converterBase(ctx)
	if err != nil {
		return finish(0, "", "缩略图服务暂不可用", repository.AssetsPreviewRetry)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, address+"/thumbnail", io.LimitReader(source, limit))
	if err != nil {
		return finish(0, "", "缩略图生成失败", repository.AssetsPreviewRetry)
	}
	request.Header.Set("Content-Type", sourceType)
	gateway, err := s.converterHTTPClient(ctx, p.UserID)
	if err != nil {
		return finish(0, "", "缩略图服务暂不可用", repository.AssetsPreviewRetry)
	}
	response, err := gateway.Do(request)
	if err != nil {
		return finish(0, "", "缩略图生成中断，将自动重试", repository.AssetsPreviewRetry)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "image/webp" {
		if response.StatusCode == http.StatusServiceUnavailable {
			return s.repo.AssetPreview.DeferPreview(ctx, p)
		}
		permanent := response.StatusCode == http.StatusUnprocessableEntity || response.StatusCode == http.StatusRequestEntityTooLarge || response.StatusCode == http.StatusUnsupportedMediaType
		failure := repository.AssetsPreviewRetry
		if permanent {
			failure = repository.AssetsPreviewFailed
		}
		return finish(0, "", "缩略图生成失败，可重试或下载原文件", failure)
	}
	output, err := io.ReadAll(io.LimitReader(response.Body, assetdomain.ThumbnailMaxSize+1))
	if err != nil || len(output) > assetdomain.ThumbnailMaxSize || len(output) < 12 || string(output[:4]) != "RIFF" || string(output[8:12]) != "WEBP" {
		return finish(0, "", "缩略图内容无效", repository.AssetsPreviewRetry)
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(output))
	if err != nil {
		return finish(0, "", "缩略图内容无法解析", repository.AssetsPreviewRetry)
	}
	if dimensions.Width <= 0 || dimensions.Height <= 0 || dimensions.Width > 512 || dimensions.Height > 512 {
		return finish(0, "", "缩略图尺寸无效", repository.AssetsPreviewRetry)
	}
	info, err := client.PutObject(ctx, c.Bucket, p.ObjectKey, bytes.NewReader(output), int64(len(output)), minio.PutObjectOptions{ContentType: "image/webp", DisableMultipart: true})
	if err != nil {
		return finish(0, "", "保存缩略图失败，将自动重试", repository.AssetsPreviewWriteUnknown)
	}
	return finish(info.Size, info.VersionID, "", repository.AssetsPreviewRetry)
}

func (s *Service) thumbnailWork(ctx context.Context) {
	previews, err := s.repo.AssetPreview.PendingRenditions(ctx, assetdomain.ThumbnailVersion)
	if err != nil {
		workerError("读取缩略图", err)
		return
	}
	available := map[int64]bool{}
	for _, p := range previews {
		// Each user's converter route is checked once; offline services do not consume file retries.
		healthy, checked := available[p.UserID]
		if !checked {
			healthy = s.rendererAvailable(ctx, p.UserID, "/thumbnail/health")
			available[p.UserID] = healthy
		}
		if !healthy {
			continue
		}
		if err := s.renderThumbnail(ctx, p); err != nil && !errors.Is(err, assetdomain.ErrNotFound) {
			workerError("缩略图", err)
		}
		if ctx.Err() != nil {
			return
		}
	}
}
