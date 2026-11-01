package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 预览缓存、执行租约与重试状态的持久化边界。
type PreviewFailure uint8

const (
	PreviewRetry PreviewFailure = iota
	PreviewFailed
	PreviewWriteUnknown
)

func (r *Repository) Preview(ctx context.Context, userID, blobID int64, create bool) (assetdomain.Preview, error) {
	return r.Rendition(ctx, userID, blobID, assetdomain.RendererVersion, create, create)
}

func (r *Repository) Rendition(ctx context.Context, userID, blobID int64, recipe string, create, retry bool) (assetdomain.Preview, error) {
	var result assetdomain.Preview
	read := func(tx *Repository) error {
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
		if missing(found.Error) != assetdomain.ErrNotFound || !create {
			return missing(found.Error)
		}
		var b assetdomain.Blob
		if err := tx.db.Where("id=? AND user_id=? AND status='ready'", blobID, userID).First(&b).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		result = assetdomain.Preview{Base: assetdomain.NewBase(userID), BlobID: blobID, RendererVersion: recipe, Status: "queued", NextRetryAt: time.Now().UTC()}
		return tx.db.Create(&result).Error
	}
	var err error
	if create {
		err = r.Write(ctx, userID, read)
	} else {
		err = read(NewRepository(r.db.WithContext(ctx)))
	}
	return result, err
}

func (r *Repository) PendingPreviews(ctx context.Context) ([]assetdomain.Preview, error) {
	return r.PendingRenditions(ctx, assetdomain.RendererVersion)
}

func (r *Repository) PendingRenditions(ctx context.Context, recipe string) ([]assetdomain.Preview, error) {
	previews := []assetdomain.Preview{}
	err := r.db.WithContext(ctx).Where("renderer_version=? AND status IN ('queued','rendering') AND next_retry_at<=now() AND (lease_until IS NULL OR lease_until<now())", recipe).Order("next_retry_at,id").Limit(10).Find(&previews).Error
	return previews, err
}

func (r *Repository) ClaimPreview(ctx context.Context, p assetdomain.Preview) (assetdomain.Preview, assetdomain.Entry, error) {
	var entry assetdomain.Entry
	var result assetdomain.Preview
	err := r.Write(ctx, p.UserID, func(tx *Repository) error {
		var current assetdomain.Preview
		if err := tx.db.Where("id=? AND user_id=? AND status IN ('queued','rendering') AND (lease_until IS NULL OR lease_until<now())", p.ID, p.UserID).First(&current).Error; err != nil {
			return assetdomain.ErrConflict
		}
		if err := tx.db.Table("omw_asset_entry e").Select(entrySelect).Joins("JOIN omw_asset_blob b ON b.id=e.blob_id AND b.user_id=e.user_id").Where("e.user_id=? AND e.blob_id=? AND e.status='ready'", current.UserID, current.BlobID).Order("e.id").First(&entry).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		var b assetdomain.Blob
		if err := tx.db.Where("id=? AND user_id=? AND status='ready'", p.BlobID, p.UserID).First(&b).Error; err != nil {
			return assetdomain.ErrNotFound
		}
		current.Status = "rendering"
		current.Attempts++
		current.LeaseToken = assetdomain.FormatID(assetdomain.NewBase(p.UserID).ID)
		until := time.Now().UTC().Add(3 * time.Minute)
		current.LeaseUntil = &until
		if current.ObjectKey == "" {
			c, err := tx.FindConnection(p.UserID, b.ConnectionID)
			if err != nil {
				return err
			}
			current.ObjectKey = assetdomain.RenditionKey(c, b.ID, current.RendererVersion)
		}
		if err := tx.db.Save(&current).Error; err != nil {
			return err
		}
		result = current
		return nil
	})
	return result, entry, err
}

func (r *Repository) FinishPreview(ctx context.Context, p assetdomain.Preview, size int64, version, message string) error {
	return r.FinishPreviewResult(ctx, p, size, version, message, PreviewRetry)
}

func (r *Repository) FinishPreviewResult(ctx context.Context, p assetdomain.Preview, size int64, version, message string, failure PreviewFailure) error {
	return r.Write(ctx, p.UserID, func(tx *Repository) error {
		status := "ready"
		if message != "" {
			status = "queued"
			if failure == PreviewFailed || p.Attempts >= 3 {
				status = "failed"
			}
		}
		var b assetdomain.Blob
		if err := tx.db.Where("user_id=? AND id=? AND status='ready'", p.UserID, p.BlobID).First(&b).Error; err != nil {
			return assetdomain.ErrConflict
		}
		var until *time.Time
		// 写响应丢失时远端可能仍在提交，保留原租约让删除等待其收敛。
		if failure == PreviewWriteUnknown {
			until = p.LeaseUntil
		}
		result := tx.db.Model(&assetdomain.Preview{}).Where("user_id=? AND id=? AND lease_token=?", p.UserID, p.ID, p.LeaseToken).Updates(map[string]any{"status": status, "size_bytes": size, "object_version_id": version, "last_error": message, "lease_token": "", "lease_until": until, "updated_at": time.Now().UTC(), "next_retry_at": time.Now().UTC().Add(time.Minute)})
		if result.Error == nil && result.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		return result.Error
	})
}

// 等待Office的PDF属于依赖等待，不记为转换失败，也不占用渲染租约。
func (r *Repository) DeferPreview(ctx context.Context, p assetdomain.Preview) error {
	result := r.db.WithContext(ctx).Model(&assetdomain.Preview{}).Where("user_id=? AND id=? AND lease_token=?", p.UserID, p.ID, p.LeaseToken).Updates(map[string]any{"status": "queued", "attempts": max(0, p.Attempts-1), "lease_token": "", "lease_until": nil, "next_retry_at": time.Now().UTC().Add(5 * time.Second), "updated_at": time.Now().UTC()})
	if result.Error == nil && result.RowsAffected != 1 {
		return assetdomain.ErrConflict
	}
	return result.Error
}
