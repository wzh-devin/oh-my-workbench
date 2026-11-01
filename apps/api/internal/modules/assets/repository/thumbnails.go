package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 缩略图批量读取、原子入队与有界旧文件补齐；不扫描对象存储。
// attachThumbnails 一页只读一次缓存索引，复制条目共用内容ID，不产生N+1查询。
func (r *Repository) attachThumbnails(userID int64, entries []assetdomain.Entry) error {
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
	var previews []assetdomain.Preview
	if err := r.db.Select("blob_id,status,id,updated_at").Where("user_id=? AND blob_id IN ? AND renderer_version=? AND status<>'cleaned'", userID, blobIDs, assetdomain.ThumbnailVersion).Find(&previews).Error; err != nil {
		return err
	}
	byBlob := map[int64]assetdomain.Preview{}
	for _, p := range previews {
		byBlob[p.BlobID] = p
	}
	for i := range entries {
		if entries[i].BlobID != nil {
			if p, ok := byBlob[*entries[i].BlobID]; ok {
				entries[i].Thumbnail = assetdomain.ThumbnailView(p)
			}
		}
	}
	return nil
}

// 调用方持有用户写事务；一次读取已有规格并批量创建，复制条目不重复排队。
func (r *Repository) queueThumbnails(entries []assetdomain.Entry) error {
	if len(entries) == 0 {
		return nil
	}
	userID := entries[0].UserID
	sources := []assetdomain.Entry{}
	blobIDs := []int64{}
	seen := map[int64]bool{}
	for _, e := range entries {
		if e.UserID != userID {
			return assetdomain.ErrInvalid
		}
		if e.BlobID != nil && !seen[*e.BlobID] && assetdomain.ThumbnailSource(e) != "" {
			seen[*e.BlobID] = true
			sources = append(sources, e)
			blobIDs = append(blobIDs, *e.BlobID)
		}
	}
	if len(sources) == 0 {
		return nil
	}
	var existing []assetdomain.Preview
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
	pending := []assetdomain.Preview{}
	for _, e := range sources {
		for _, recipe := range []string{assetdomain.ThumbnailVersion, assetdomain.RendererVersion} {
			if recipe == assetdomain.RendererVersion && assetdomain.ThumbnailSource(e) != "office" {
				continue
			}
			if !cached[cacheKey{*e.BlobID, recipe}] {
				pending = append(pending, assetdomain.Preview{Base: assetdomain.NewBase(userID), BlobID: *e.BlobID, RendererVersion: recipe, Status: "queued", NextRetryAt: time.Now().UTC()})
			}
		}
	}
	if len(pending) == 0 {
		return nil
	}
	return r.db.CreateInBatches(&pending, 400).Error
}

// 当前页优先补齐；已有状态（包括失败）不重复入队，不重置重试次数。
func (r *Repository) QueueThumbnails(ctx context.Context, userID int64, entries []assetdomain.Entry, visible bool) error {
	if err := NewRepository(r.db.WithContext(ctx)).attachThumbnails(userID, entries); err != nil {
		return err
	}
	missing := []int64{}
	for _, e := range entries {
		if e.Thumbnail == nil && assetdomain.ThumbnailSource(e) != "" {
			missing = append(missing, e.ID)
		}
	}
	if len(missing) == 0 {
		return r.prioritizeThumbnails(ctx, userID, entries, visible)
	}
	err := r.Write(ctx, userID, func(tx *Repository) error {
		var currentEntries []assetdomain.Entry
		if err := tx.db.Raw(hiddenCTE+"SELECT "+entrySelect+" FROM omw_asset_entry e JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id AND b.status='ready' JOIN omw_asset_connection c ON c.id=e.connection_id AND c.user_id=e.user_id AND c.enabled=true WHERE e.user_id=? AND e.id IN ? AND e.status='ready' AND e.id NOT IN (SELECT id FROM hidden)", userID, userID, userID, missing).Scan(&currentEntries).Error; err != nil {
			return err
		}
		return tx.queueThumbnails(currentEntries)
	})
	if err != nil {
		return err
	}
	if err := NewRepository(r.db.WithContext(ctx)).attachThumbnails(userID, entries); err != nil {
		return err
	}
	return r.prioritizeThumbnails(ctx, userID, entries, visible)
}

// 已浏览且尚未尝试的内容排在后台补齐前；失败退避和在途租约保持不变。
func (r *Repository) prioritizeThumbnails(ctx context.Context, userID int64, entries []assetdomain.Entry, visible bool) error {
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
	return r.db.WithContext(ctx).Model(&assetdomain.Preview{}).Where("user_id=? AND blob_id IN ? AND renderer_version IN ? AND status='queued' AND attempts=0 AND next_retry_at>?", userID, ids, []string{assetdomain.ThumbnailVersion, assetdomain.RendererVersion}, priority).Update("next_retry_at", priority).Error
}

// 以条目主键游标每轮读取20项，旧文件补齐有界且不阻塞上传工作协程。
func (r *Repository) ThumbnailBackfill(ctx context.Context, after int64) ([]assetdomain.Entry, error) {
	entries := []assetdomain.Entry{}
	err := r.db.WithContext(ctx).Table("omw_asset_entry e").Select(entrySelect).Joins("JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id AND b.status='ready'").Joins("JOIN omw_asset_connection c ON c.id=e.connection_id AND c.user_id=e.user_id AND c.enabled=true").Where("e.id>? AND e.kind='file' AND e.status='ready' AND e.trashed_at IS NULL", after).Order("e.id").Limit(20).Find(&entries).Error
	return entries, err
}

// 修复旧对象类型后只更新精确定位，原版本保留给已经开始的下载请求。
func (r *Repository) UpdateBlobMetadata(ctx context.Context, b assetdomain.Blob, version, etag string) error {
	result := r.db.WithContext(ctx).Model(&assetdomain.Blob{}).Where("user_id=? AND id=? AND status='ready' AND object_version_id=? AND etag=?", b.UserID, b.ID, b.ObjectVersionID, b.Etag).Updates(map[string]any{"object_version_id": version, "etag": etag, "updated_at": time.Now().UTC()})
	if result.Error == nil && result.RowsAffected != 1 {
		return assetdomain.ErrConflict
	}
	return result.Error
}
