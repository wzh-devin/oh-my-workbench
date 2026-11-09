package repository

import (
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
)

type AssetPreview struct {
	AssetBase
	BlobID          int64      `json:"-"`
	RendererVersion string     `json:"rendererVersion"`
	Status          string     `json:"status"`
	ObjectKey       string     `json:"-"`
	ObjectVersionID string     `json:"-"`
	SizeBytes       int64      `json:"size"`
	LastError       string     `json:"error"`
	Attempts        int        `json:"-"`
	NextRetryAt     time.Time  `json:"-"`
	LeaseToken      string     `json:"-"`
	LeaseUntil      *time.Time `json:"-"`
}

func (AssetPreview) TableName() string { return "omw_asset_preview" }

// 固定支持范围；HTML 等源码只按纯文本处理，不执行页面或外部资源。
func AssetThumbnailSource(e AssetEntry) string {
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
	if e.Size <= 50<<20 && AssetOfficeFilename(e) != "" {
		return "office"
	}
	// 文本只取有界前缀，HTML/SVG源码不会交给浏览器或可执行格式加载器。
	if e.Size <= assetdomain.MaxFileSize {
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

func AssetRenditionKey(c AssetConnection, blobID int64, recipe string) string {
	filename := "preview-v1.pdf"
	if recipe == assetdomain.ThumbnailVersion {
		filename = "thumbnail-512-v1.webp"
	}
	return path.Join(c.Prefix, assetdomain.FormatID(c.UserID), assetdomain.FormatID(blobID), filename)
}

func AssetThumbnailView(p AssetPreview) *assetdto.Thumbnail {
	view := &assetdto.Thumbnail{Status: p.Status}
	if p.Status == "ready" {
		view.Version = fmt.Sprintf("%d-%d", p.ID, p.UpdatedAt.UnixNano())
	}
	return view
}

func (r *AssetPreviewRepository) Preview(ctx context.Context, userID, blobID int64, create bool) (AssetPreview, error) {
	return r.Rendition(ctx, userID, blobID, assetdomain.RendererVersion, create, create)
}

func (r *AssetPreviewRepository) Rendition(ctx context.Context, userID, blobID int64, recipe string, create, retry bool) (AssetPreview, error) {
	var result AssetPreview
	read := func(tx *Store) error {
		found := tx.db.Where("user_id=? AND blob_id=? AND renderer_version=?", userID, blobID, recipe).First(&result)
		if found.Error == nil {
			if retry && result.Status == "failed" {
				result.Status = "queued"
				result.LastError = ""
				result.Attempts = 0
				result.NextRetryAt = time.Now().UTC()
				return tx.db.Save(&result).Error
			}
			return nil
		}
		if assetsMissing(found.Error) != assetdomain.ErrNotFound || !create {
			return assetsMissing(found.Error)
		}
		var b AssetBlob
		if err := tx.db.Where("id=? AND user_id=? AND status='ready'", blobID, userID).First(&b).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		result = AssetPreview{AssetBase: NewAssetBase(userID), BlobID: blobID, RendererVersion: recipe, Status: "queued", NextRetryAt: time.Now().UTC()}
		return tx.db.Create(&result).Error
	}
	var err error
	if create {
		err = r.AssetEntry.Write(ctx, userID, read)
	} else {
		err = read(New(r.db.WithContext(ctx), nil))
	}
	return result, err
}

func (r *AssetPreviewRepository) PendingPreviews(ctx context.Context) ([]AssetPreview, error) {
	return r.PendingRenditions(ctx, assetdomain.RendererVersion)
}

func (r *AssetPreviewRepository) PendingRenditions(ctx context.Context, recipe string) ([]AssetPreview, error) {
	previews := []AssetPreview{}
	err := r.db.WithContext(ctx).Where("renderer_version=? AND status IN ('queued','rendering') AND next_retry_at<=now() AND (lease_until IS NULL OR lease_until<now())", recipe).Order("next_retry_at,id").Limit(10).Find(&previews).Error
	return previews, err
}

func (r *AssetPreviewRepository) ClaimPreview(ctx context.Context, p AssetPreview) (AssetPreview, AssetEntry, error) {
	var entry AssetEntry
	var result AssetPreview
	err := r.AssetEntry.Write(ctx, p.UserID, func(tx *Store) error {
		var current AssetPreview
		if err := tx.db.Where("id=? AND user_id=? AND status IN ('queued','rendering') AND (lease_until IS NULL OR lease_until<now())", p.ID, p.UserID).First(&current).Error; err != nil {
			return assetdomain.ErrConflict
		}
		if err := tx.db.Table("omw_asset_entry e").Select(assetsEntrySelect).Joins("JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id").Where("e.user_id=? AND e.blob_id=? AND e.status='ready'", current.UserID, current.BlobID).Order("e.id").First(&entry).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		var b AssetBlob
		if err := tx.db.Where("id=? AND user_id=? AND status='ready'", p.BlobID, p.UserID).First(&b).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		current.Status = "rendering"
		current.Attempts++
		current.LeaseToken = assetdomain.FormatID(NewAssetBase(p.UserID).ID)
		until := time.Now().UTC().Add(3 * time.Minute)
		current.LeaseUntil = &until
		if current.ObjectKey == "" {
			c, err := tx.AssetConnection.FindConnection(p.UserID, b.ConnectionID)
			if err != nil {
				return err
			}
			current.ObjectKey = AssetRenditionKey(c, b.ID, current.RendererVersion)
		}
		if err := tx.db.Save(&current).Error; err != nil {
			return err
		}
		result = current
		return nil
	})
	return result, entry, err
}

func (r *AssetPreviewRepository) FinishPreview(ctx context.Context, p AssetPreview, size int64, version, message string) error {
	return r.FinishPreviewResult(ctx, p, size, version, message, AssetsPreviewRetry)
}

func (r *AssetPreviewRepository) FinishPreviewResult(ctx context.Context, p AssetPreview, size int64, version, message string, failure AssetsPreviewFailure) error {
	return r.AssetEntry.Write(ctx, p.UserID, func(tx *Store) error {
		status := "ready"
		if message != "" {
			status = "queued"
			if failure == AssetsPreviewFailed || p.Attempts >= 3 {
				status = "failed"
			}
		}
		var b AssetBlob
		if err := tx.db.Where("user_id=? AND id=? AND status='ready'", p.UserID, p.BlobID).First(&b).Error; err != nil {
			return assetdomain.ErrConflict
		}
		var until *time.Time
		// 写响应丢失时远端可能仍在提交，保留原租约让删除等待其收敛。
		if failure == AssetsPreviewWriteUnknown {
			until = p.LeaseUntil
		}
		result := tx.db.Model(&AssetPreview{}).Where("user_id=? AND id=? AND lease_token=?", p.UserID, p.ID, p.LeaseToken).Updates(map[string]any{"status": status, "size_bytes": size, "object_version_id": version, "last_error": message, "lease_token": "", "lease_until": until, "updated_at": time.Now().UTC(), "next_retry_at": time.Now().UTC().Add(time.Minute)})
		if result.Error == nil && result.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		return result.Error
	})
}

// 等待Office的PDF属于依赖等待，不记为转换失败，也不占用渲染租约。
func (r *AssetPreviewRepository) DeferPreview(ctx context.Context, p AssetPreview) error {
	result := r.db.WithContext(ctx).Model(&AssetPreview{}).Where("user_id=? AND id=? AND lease_token=?", p.UserID, p.ID, p.LeaseToken).Updates(map[string]any{"status": "queued", "attempts": max(0, p.Attempts-1), "lease_token": "", "lease_until": nil, "next_retry_at": time.Now().UTC().Add(5 * time.Second), "updated_at": time.Now().UTC()})
	if result.Error == nil && result.RowsAffected != 1 {
		return assetdomain.ErrConflict
	}
	return result.Error
}

// 缩略图批量读取、原子入队与有界旧文件补齐；不扫描对象存储。
// attachThumbnails 一页只读一次缓存索引，复制条目共用内容ID，不产生N+1查询。
func (r *AssetPreviewRepository) attachThumbnails(userID int64, entries []AssetEntry) error {
	blobIDs := []int64{}
	seen := map[int64]bool{}
	for _, e := range entries {
		if e.Kind == "file" && e.BlobID != nil && !seen[*e.BlobID] {
			blobIDs = append(blobIDs, *e.BlobID)
			seen[*e.BlobID] = true
		}
	}
	if len(blobIDs) == 0 {
		return nil
	}
	var previews []AssetPreview
	if err := r.db.Select("blob_id,status,id,updated_at").Where("user_id=? AND blob_id IN ? AND renderer_version=? AND status<>'cleaned'", userID, blobIDs, assetdomain.ThumbnailVersion).Find(&previews).Error; err != nil {
		return err
	}
	byBlob := map[int64]AssetPreview{}
	for _, p := range previews {
		byBlob[p.BlobID] = p
	}
	for i := range entries {
		if entries[i].BlobID != nil {
			if p, ok := byBlob[*entries[i].BlobID]; ok {
				entries[i].Thumbnail = AssetThumbnailView(p)
			}
		}
	}
	return nil
}

// 调用方持有用户写事务；一次读取已有规格并批量创建，复制条目不重复排队。
func (r *AssetPreviewRepository) queueThumbnails(entries []AssetEntry) error {
	if len(entries) == 0 {
		return nil
	}
	userID := entries[0].UserID
	sources := []AssetEntry{}
	blobIDs := []int64{}
	seen := map[int64]bool{}
	for _, e := range entries {
		if e.UserID != userID {
			return assetdomain.ErrInvalid
		}
		if e.BlobID != nil && !seen[*e.BlobID] && AssetThumbnailSource(e) != "" {
			seen[*e.BlobID] = true
			sources = append(sources, e)
			blobIDs = append(blobIDs, *e.BlobID)
		}
	}
	if len(sources) == 0 {
		return nil
	}
	var existing []AssetPreview
	if err := r.db.Select("blob_id,renderer_version").Where("user_id=? AND blob_id IN ? AND renderer_version IN ?", userID, blobIDs, []string{assetdomain.ThumbnailVersion, assetdomain.RendererVersion}).Find(&existing).Error; err != nil {
		return err
	}
	type cacheKey struct {
		blobID int64
		recipe string
	}
	cached := map[cacheKey]bool{}
	for _, p := range existing {
		cached[cacheKey{p.BlobID, p.RendererVersion}] = true
	}
	pending := []AssetPreview{}
	for _, e := range sources {
		for _, recipe := range []string{assetdomain.ThumbnailVersion, assetdomain.RendererVersion} {
			if recipe == assetdomain.RendererVersion && AssetThumbnailSource(e) != "office" {
				continue
			}
			if !cached[cacheKey{*e.BlobID, recipe}] {
				pending = append(pending, AssetPreview{AssetBase: NewAssetBase(userID), BlobID: *e.BlobID, RendererVersion: recipe, Status: "queued", NextRetryAt: time.Now().UTC()})
			}
		}
	}
	if len(pending) == 0 {
		return nil
	}
	return r.db.CreateInBatches(&pending, 400).Error
}

// 当前页优先补齐；已有状态（包括失败）不重复入队，不重置重试次数。
func (r *AssetPreviewRepository) QueueThumbnails(ctx context.Context, userID int64, entries []AssetEntry, visible bool) error {
	if err := New(r.db.WithContext(ctx), nil).AssetPreview.attachThumbnails(userID, entries); err != nil {
		return err
	}
	missing := []int64{}
	for _, e := range entries {
		if e.Thumbnail == nil && AssetThumbnailSource(e) != "" {
			missing = append(missing, e.ID)
		}
	}
	if len(missing) == 0 {
		return r.prioritizeThumbnails(ctx, userID, entries, visible)
	}
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		var currentEntries []AssetEntry
		if err := tx.db.Raw(assetsHiddenCTE+"SELECT "+assetsEntrySelect+" FROM omw_asset_entry e JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id AND b.status='ready' JOIN omw_asset_connection c ON c.id=e.connection_id AND c.user_id=e.user_id AND c.enabled=true WHERE e.user_id=? AND e.id IN ? AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID, missing).Scan(&currentEntries).Error; err != nil {
			return err
		}
		return tx.AssetPreview.queueThumbnails(currentEntries)
	})
	if err != nil {
		return err
	}
	if err := New(r.db.WithContext(ctx), nil).AssetPreview.attachThumbnails(userID, entries); err != nil {
		return err
	}
	return r.prioritizeThumbnails(ctx, userID, entries, visible)
}

// 已浏览且尚未尝试的内容排在后台补齐前；失败退避和在途租约保持不变。
func (r *AssetPreviewRepository) prioritizeThumbnails(ctx context.Context, userID int64, entries []AssetEntry, visible bool) error {
	if !visible {
		return nil
	}
	ids := []int64{}
	seen := map[int64]bool{}
	for _, e := range entries {
		if e.BlobID != nil && !seen[*e.BlobID] && e.Thumbnail != nil && e.Thumbnail.Status == "queued" {
			ids = append(ids, *e.BlobID)
			seen[*e.BlobID] = true
		}
	}
	if len(ids) == 0 {
		return nil
	}
	priority := time.Unix(0, 0).UTC()
	return r.db.WithContext(ctx).Model(&AssetPreview{}).Where("user_id=? AND blob_id IN ? AND renderer_version IN ? AND status='queued' AND attempts=0 AND next_retry_at>?", userID, ids, []string{assetdomain.ThumbnailVersion, assetdomain.RendererVersion}, priority).Update("next_retry_at", priority).Error
}

type AssetPreviewRepository struct{ *Store }
