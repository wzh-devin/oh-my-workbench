// 缩略图仅派生不可变内容，沿用预览缓存、租约和最后引用清理。
package assets

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
)

const thumbnailVersion = "thumbnail-512-v1"
const thumbnailMaxSize = 2 << 20

type Thumbnail struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
}

// 固定支持范围；HTML 等源码只按纯文本处理，不执行页面或外部资源。
func thumbnailSource(e Entry) string {
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
	if e.Size <= 50<<20 && officeFilename(e) != "" {
		return "office"
	}
	// 文本只取有界前缀，HTML/SVG源码不会交给浏览器或可执行格式加载器。
	if e.Size <= maxFileSize {
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

func renditionKey(c Connection, blobID int64, recipe string) string {
	filename := "preview-v1.pdf"
	if recipe == thumbnailVersion {
		filename = "thumbnail-512-v1.webp"
	}
	return path.Join(c.Prefix, formatID(c.UserID), formatID(blobID), filename)
}

func thumbnailView(p Preview) *Thumbnail {
	view := &Thumbnail{Status: p.Status}
	if p.Status == "ready" {
		view.Version = fmt.Sprintf("%d-%d", p.ID, p.UpdatedAt.UnixNano())
	}
	return view
}

// Thumbnail 显式重试沿用文件权限；后台补齐不会反复重置失败记录。
func (s *Service) Thumbnail(ctx context.Context, userID, id int64) (*Thumbnail, error) {
	e, b, _, err := s.repo.Content(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	if thumbnailSource(e) == "" {
		return nil, ErrInvalid
	}
	if thumbnailSource(e) == "office" {
		if _, err := s.repo.rendition(ctx, userID, b.ID, rendererVersion, true, true); err != nil {
			return nil, err
		}
	}
	p, err := s.repo.rendition(ctx, userID, b.ID, thumbnailVersion, true, true)
	return thumbnailView(p), err
}

func (s *Service) rendererAvailable(ctx context.Context, suffix string) bool {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, s.converterURL+suffix, nil)
	if err != nil {
		return false
	}
	response, err := converterClient.Do(request)
	if err != nil {
		return false
	}
	response.Body.Close()
	return response.StatusCode == http.StatusOK
}

func (s *Service) renderThumbnail(ctx context.Context, preview Preview) error {
	p, e, err := s.repo.ClaimPreview(ctx, preview)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	finish := func(size int64, version, message string, failure previewFailure) error {
		saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		defer stop()
		return s.repo.finishPreview(saveCtx, p, size, version, message, failure)
	}
	sourceType := thumbnailSource(e)
	if sourceType == "" {
		return finish(0, "", "该文件暂不支持缩略图", previewFailed)
	}
	b, err := s.repo.Blob(ctx, p.UserID, p.BlobID)
	if err != nil {
		return err
	}
	c, err := s.repo.Connection(ctx, p.UserID, b.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(c)
	if err != nil {
		return finish(0, "", "暂时无法读取存储", previewRetry)
	}
	// 旧文件保留Key和旧版本；复制结果不确定时保留租约，避免清理早于远端提交。
	if info, err := client.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID}); err == nil && info.Size == b.SizeBytes && info.ETag == b.Etag && info.ContentType != e.ContentType {
		updated, err := client.contentMetadata(ctx, c, b, info, e.ContentType)
		if err == nil {
			if err := s.repo.UpdateBlobMetadata(ctx, b, updated.VersionID, updated.ETag); err == nil {
				b.ObjectVersionID, b.Etag = updated.VersionID, updated.ETag
			}
		} else if status := minio.ToErrorResponse(err).StatusCode; status < 400 || status >= 500 {
			return finish(0, "", "保存原件类型中断，将自动重试", previewWriteUnknown)
		}
	}
	// 响应丢失或进程重启时直接找回完整产物，避免再次转换。
	if info, err := client.StatObject(ctx, c.Bucket, p.ObjectKey, minio.StatObjectOptions{}); err == nil && info.ContentType == "image/webp" && info.Size > 0 && info.Size <= thumbnailMaxSize {
		return finish(info.Size, info.VersionID, "", previewRetry)
	}
	key, version := b.ObjectKey, b.ObjectVersionID
	if sourceType == "office" {
		pdf, err := s.repo.rendition(ctx, p.UserID, p.BlobID, rendererVersion, true, false)
		if err != nil {
			return finish(0, "", "读取文档预览失败", previewRetry)
		}
		if pdf.Status == "failed" {
			return finish(0, "", "文档转换失败，可重试或下载原文件", previewFailed)
		}
		if pdf.Status != "ready" {
			return s.repo.DeferPreview(ctx, p)
		}
		key, version, sourceType = pdf.ObjectKey, pdf.ObjectVersionID, "application/pdf"
	}
	source, err := client.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{VersionID: version})
	if err != nil {
		return finish(0, "", "读取原文件失败", previewRetry)
	}
	defer source.Close()
	limit := int64(100<<20 + 1)
	if strings.HasPrefix(sourceType, "text/") {
		limit = 512 << 10
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.converterURL+"/thumbnail", io.LimitReader(source, limit))
	if err != nil {
		return finish(0, "", "缩略图生成失败", previewRetry)
	}
	request.Header.Set("Content-Type", sourceType)
	response, err := converterClient.Do(request)
	if err != nil {
		return finish(0, "", "缩略图生成中断，将自动重试", previewRetry)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "image/webp" {
		if response.StatusCode == http.StatusServiceUnavailable {
			return s.repo.DeferPreview(ctx, p)
		}
		permanent := response.StatusCode == http.StatusUnprocessableEntity || response.StatusCode == http.StatusRequestEntityTooLarge || response.StatusCode == http.StatusUnsupportedMediaType
		failure := previewRetry
		if permanent {
			failure = previewFailed
		}
		return finish(0, "", "缩略图生成失败，可重试或下载原文件", failure)
	}
	output, err := io.ReadAll(io.LimitReader(response.Body, thumbnailMaxSize+1))
	if err != nil || len(output) > thumbnailMaxSize || len(output) < 12 || string(output[:4]) != "RIFF" || string(output[8:12]) != "WEBP" {
		return finish(0, "", "缩略图内容无效", previewRetry)
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(output))
	if err != nil || dimensions.Width <= 0 || dimensions.Height <= 0 || dimensions.Width > 512 || dimensions.Height > 512 {
		return finish(0, "", "缩略图尺寸无效", previewRetry)
	}
	info, err := client.PutObject(ctx, c.Bucket, p.ObjectKey, bytes.NewReader(output), int64(len(output)), minio.PutObjectOptions{ContentType: "image/webp", DisableMultipart: true})
	if err != nil {
		return finish(0, "", "保存缩略图失败，将自动重试", previewWriteUnknown)
	}
	return finish(info.Size, info.VersionID, "", previewRetry)
}

func (s *Service) thumbnailWork(ctx context.Context) {
	// 服务离线不消耗文件重试次数，也不影响原件上传。
	if !s.rendererAvailable(ctx, "/thumbnail/health") {
		return
	}
	previews, err := s.repo.pendingRenditions(ctx, thumbnailVersion)
	if err != nil {
		workerError("读取缩略图", err)
		return
	}
	for _, p := range previews {
		if err := s.renderThumbnail(ctx, p); err != nil && !errors.Is(err, ErrNotFound) {
			workerError("缩略图", err)
		}
		if ctx.Err() != nil {
			return
		}
	}
}
