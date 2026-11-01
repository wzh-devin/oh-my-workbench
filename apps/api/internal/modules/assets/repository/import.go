package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 导入只修改当前用户已登记的旧 ID，浏览器原件不会被服务端删除。
// ImportMetadata 在整批内容上传后恢复原收藏、时间和独立回收状态。
func (r *Repository) ImportMetadata(ctx context.Context, userID int64, input []assetdomain.ImportEntry) error {
	if len(input) == 0 || len(input) > 200 {
		return assetdomain.ErrInvalid
	}
	for _, item := range input {
		if !assetdomain.ValidText(item.LegacyID, 100) || item.CreatedAt.IsZero() {
			return assetdomain.ErrInvalid
		}
	}
	return r.Write(ctx, userID, func(tx *Repository) error {
		for _, item := range input {
			var e assetdomain.Entry
			if err := tx.db.Where("user_id=? AND legacy_id=? AND status='ready'", userID, item.LegacyID).First(&e).Error; err != nil {
				return missing(err)
			}
			if e.LegacyRestoredAt != nil {
				continue
			}
			updated := item.CreatedAt
			if item.UpdatedAt != nil {
				updated = *item.UpdatedAt
			}
			if updated.IsZero() {
				updated = time.Now().UTC()
			}
			if err := tx.db.Model(&e).Updates(map[string]any{"starred": item.Starred, "created_at": item.CreatedAt, "updated_at": updated, "last_opened_at": item.LastOpenedAt, "trashed_at": item.TrashedAt, "version": e.Version + 1, "legacy_restored_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// LegacyEntry 兼容导入前的文件定位链接，返回新的稳定 ID 与目录位置。
func (r *Repository) LegacyEntry(ctx context.Context, userID int64, legacyID string) (assetdomain.Entry, error) {
	if id, err := assetdomain.ParseID(legacyID); err == nil {
		return r.DetailEntry(ctx, userID, id)
	}
	if !assetdomain.ValidText(legacyID, 100) {
		return assetdomain.Entry{}, assetdomain.ErrInvalid
	}
	var entry assetdomain.Entry
	if err := r.db.WithContext(ctx).Where("user_id=? AND legacy_id=?", userID, legacyID).First(&entry).Error; err != nil {
		return entry, missing(err)
	}
	return r.DetailEntry(ctx, userID, entry.ID)
}

// DetailEntry 可读取自己的回收站元数据，内容读取仍走独立的可见性检查。
func (r *Repository) DetailEntry(ctx context.Context, userID, id int64) (assetdomain.Entry, error) {
	var entry assetdomain.Entry
	result := r.db.WithContext(ctx).Raw(hiddenCTE+"SELECT "+entrySelect+",e.id IN (SELECT id FROM hidden) AS hidden FROM omw_asset_entry e LEFT JOIN omw_asset_blob b ON b.id=e.blob_id WHERE e.user_id=? AND e.id=? AND e.status='ready'", userID, userID, userID, id).Scan(&entry)
	if result.Error != nil {
		return entry, result.Error
	}
	if result.RowsAffected == 0 {
		return entry, assetdomain.ErrNotFound
	}
	if entry.Kind == "folder" {
		var count struct{ Total, Size int64 }
		err := r.db.WithContext(ctx).Raw(`WITH RECURSIVE contents AS (
    SELECT id,kind,blob_id,(trashed_at IS NOT NULL) AS hidden FROM omw_asset_entry WHERE user_id=? AND parent_id=? AND status='ready'
    UNION SELECT e.id,e.kind,e.blob_id,(c.hidden OR e.trashed_at IS NOT NULL) FROM omw_asset_entry e JOIN contents c ON e.parent_id=c.id WHERE e.user_id=? AND e.status='ready'
   ) SELECT count(*) AS total,COALESCE(sum(b.size_bytes),0) AS size FROM contents c JOIN omw_asset_blob b ON b.id=c.blob_id WHERE c.kind='file' AND NOT c.hidden`, userID, id, userID).Scan(&count).Error
		if err != nil {
			return entry, err
		}
		entry.FileCount = &count.Total
		entry.Size = count.Size
	}
	return entry, nil
}
