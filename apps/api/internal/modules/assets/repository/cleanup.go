package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 共享内容的清理租约、预览清理状态与失败重试记录。
// 探测前先保存清理定位；进程中断后租约到期仍能回收对象。
func (r *Repository) ProbeBlob(ctx context.Context, c assetdomain.Connection) (assetdomain.Blob, error) {
	until := time.Now().UTC().Add(3 * time.Minute)
	b := assetdomain.Blob{Base: assetdomain.NewBase(c.UserID), ConnectionID: c.ID, Status: "cleaning", NextRetryAt: time.Now().UTC(), LeaseUntil: &until}
	b.ObjectKey = assetdomain.ObjectKey(c, b.ID, "probe.bin")
	b.LeaseToken = assetdomain.FormatID(b.ID)
	err := r.Write(ctx, c.UserID, func(tx *Repository) error { return tx.db.Create(&b).Error })
	return b, err
}

// 清理以事务状态排除新引用，实际网络删除交给持久化任务重试。
func (r *Repository) CleanupBlobs(ctx context.Context) ([]assetdomain.Blob, error) {
	blobs := []assetdomain.Blob{}
	err := r.db.WithContext(ctx).Where("status='cleaning' AND next_retry_at<=now() AND (lease_until IS NULL OR lease_until<now())").Order("id").Limit(20).Find(&blobs).Error
	return blobs, err
}

func (r *Repository) ClaimBlob(ctx context.Context, b assetdomain.Blob) (assetdomain.Blob, error) {
	var result assetdomain.Blob
	err := r.Write(ctx, b.UserID, func(tx *Repository) error {
		var current assetdomain.Blob
		if err := tx.db.Where("id=? AND status='cleaning' AND (lease_until IS NULL OR lease_until<now())", b.ID).First(&current).Error; err != nil {
			return assetdomain.ErrConflict
		}
		var count int64
		if err := tx.db.Model(&assetdomain.Entry{}).Where("blob_id=?", b.ID).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return assetdomain.ErrConflict
		}
		current.LeaseToken = assetdomain.FormatID(assetdomain.NewBase(b.UserID).ID)
		until := time.Now().UTC().Add(3 * time.Minute)
		current.LeaseUntil = &until
		if err := tx.db.Save(&current).Error; err != nil {
			return err
		}
		result = current
		return nil
	})
	return result, err
}

func (r *Repository) FinishBlob(ctx context.Context, b assetdomain.Blob, message string) error {
	return r.Write(ctx, b.UserID, func(tx *Repository) error {
		status := "cleaned"
		if message != "" {
			status = "cleaning"
		}
		result := tx.db.Model(&assetdomain.Blob{}).Where("id=? AND user_id=? AND lease_token=?", b.ID, b.UserID, b.LeaseToken).Updates(map[string]any{"status": status, "last_error": message, "lease_until": nil, "lease_token": "", "next_retry_at": time.Now().UTC().Add(time.Minute), "updated_at": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		if message == "" {
			if err := tx.db.Model(&assetdomain.Preview{}).Where("user_id=? AND blob_id=?", b.UserID, b.ID).Updates(map[string]any{"status": "cleaned", "lease_token": "", "lease_until": nil, "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			return tx.db.Model(&assetdomain.Operation{}).Where("user_id=? AND connection_id=? AND status='cleaning' AND NOT EXISTS (SELECT 1 FROM omw_asset_blob b WHERE b.connection_id=omw_asset_operation.connection_id AND b.user_id=omw_asset_operation.user_id AND b.status='cleaning')", b.UserID, b.ConnectionID).Updates(map[string]any{"status": "completed", "updated_at": time.Now().UTC()}).Error
		}
		return nil
	})
}

func (r *Repository) BlobPreviews(ctx context.Context, b assetdomain.Blob) ([]assetdomain.Preview, error) {
	previews := []assetdomain.Preview{}
	err := r.db.WithContext(ctx).Where("user_id=? AND blob_id=?", b.UserID, b.ID).Find(&previews).Error
	return previews, err
}
