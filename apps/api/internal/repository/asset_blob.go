package repository

import (
	"context"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
)

type AssetBlob struct {
	AssetBase
	ConnectionID    int64
	SHA256          *string
	SizeBytes       int64
	ObjectKey       string
	ObjectVersionID string
	Etag            string
	Status          string
	VerifiedAt      *time.Time
	NextRetryAt     time.Time
	LeaseToken      string
	LeaseUntil      *time.Time
	LastError       string
}

func (AssetBlob) TableName() string { return "omw_asset_blob" }

var assetObjectExtension = regexp.MustCompile(`^\.[a-z0-9]{1,12}$`)

func AssetObjectKey(c AssetConnection, blobID int64, name string) string {
	extension := strings.ToLower(filepath.Ext(name))
	if !assetObjectExtension.MatchString(extension) {
		extension = ".bin"
	}
	return path.Join(c.Prefix, assetdomain.FormatID(c.UserID), assetdomain.FormatID(blobID), "original"+extension)
}

// 共享内容的清理租约、预览清理状态与失败重试记录。
// 探测前先保存清理定位；进程中断后租约到期仍能回收对象。
func (r *AssetBlobRepository) ProbeBlob(ctx context.Context, c AssetConnection) (AssetBlob, error) {
	until := time.Now().UTC().Add(3 * time.Minute)
	b := AssetBlob{AssetBase: NewAssetBase(c.UserID), ConnectionID: c.ID, Status: "cleaning", NextRetryAt: time.Now().UTC(), LeaseUntil: &until}
	b.ObjectKey = AssetObjectKey(c, b.ID, "probe.bin")
	b.LeaseToken = assetdomain.FormatID(b.ID)
	err := r.AssetEntry.Write(ctx, c.UserID, func(tx *Store) error { return tx.db.Create(&b).Error })
	return b, err
}

// 清理以事务状态排除新引用，实际网络删除交给持久化任务重试。
func (r *AssetBlobRepository) CleanupBlobs(ctx context.Context) ([]AssetBlob, error) {
	blobs := []AssetBlob{}
	err := r.db.WithContext(ctx).Where("status='cleaning' AND next_retry_at<=now() AND (lease_until IS NULL OR lease_until<now())").Order("id").Limit(20).Find(&blobs).Error
	return blobs, err
}

func (r *AssetBlobRepository) ClaimBlob(ctx context.Context, b AssetBlob) (AssetBlob, error) {
	var result AssetBlob
	err := r.AssetEntry.Write(ctx, b.UserID, func(tx *Store) error {
		var current AssetBlob
		if err := tx.db.Where("id=? AND status='cleaning' AND (lease_until IS NULL OR lease_until<now())", b.ID).First(&current).Error; err != nil {
			return assetdomain.ErrConflict
		}
		var count int64
		if err := tx.db.Model(&AssetEntry{}).Where("blob_id=?", b.ID).Count(&count).Error; err != nil {
			return err
		}
		if count != 0 {
			return assetdomain.ErrConflict
		}
		current.LeaseToken = assetdomain.FormatID(NewAssetBase(b.UserID).ID)
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

func (r *AssetBlobRepository) FinishBlob(ctx context.Context, b AssetBlob, message string) error {
	return r.AssetEntry.Write(ctx, b.UserID, func(tx *Store) error {
		status := "cleaned"
		if message != "" {
			status = "cleaning"
		}
		result := tx.db.Model(&AssetBlob{}).Where("id=? AND user_id=? AND lease_token=?", b.ID, b.UserID, b.LeaseToken).Updates(map[string]any{"status": status, "last_error": message, "lease_until": nil, "lease_token": "", "next_retry_at": time.Now().UTC().Add(time.Minute), "updated_at": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		if message == "" {
			if err := tx.db.Model(&AssetPreview{}).Where("user_id=? AND blob_id=?", b.UserID, b.ID).Updates(map[string]any{"status": "cleaned", "lease_token": "", "lease_until": nil, "updated_at": time.Now().UTC()}).Error; err != nil {
				return err
			}
			return tx.db.Model(&AssetOperation{}).Where("user_id=? AND connection_id=? AND status='cleaning' AND NOT EXISTS (SELECT 1 FROM omw_asset_blob b WHERE b.connection_id=omw_asset_operation.connection_id AND b.user_id=omw_asset_operation.user_id AND b.status='cleaning')", b.UserID, b.ConnectionID).Updates(map[string]any{"status": "completed", "updated_at": time.Now().UTC()}).Error
		}
		return nil
	})
}

func (r *AssetBlobRepository) BlobPreviews(ctx context.Context, b AssetBlob) ([]AssetPreview, error) {
	previews := []AssetPreview{}
	err := r.db.WithContext(ctx).Where("user_id=? AND blob_id=?", b.UserID, b.ID).Find(&previews).Error
	return previews, err
}

func (r *AssetBlobRepository) Blob(ctx context.Context, userID, id int64) (AssetBlob, error) {
	var b AssetBlob
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", userID, id).First(&b).Error
	return b, assetsMissing(err)
}

func (r *AssetBlobRepository) DedupBlob(ctx context.Context, userID, connectionID int64, hash string, size int64) (AssetBlob, error) {
	var b AssetBlob
	err := r.db.WithContext(ctx).Where("user_id=? AND connection_id=? AND sha256=? AND size_bytes=? AND status='ready' AND verified_at IS NOT NULL", userID, connectionID, hash, size).Order("id").First(&b).Error
	return b, assetsMissing(err)
}

// 修复旧对象类型后只更新精确定位，原版本保留给已经开始的下载请求。
func (r *AssetBlobRepository) UpdateBlobMetadata(ctx context.Context, b AssetBlob, version, etag string) error {
	result := r.db.WithContext(ctx).Model(&AssetBlob{}).Where("user_id=? AND id=? AND status='ready' AND object_version_id=? AND etag=?", b.UserID, b.ID, b.ObjectVersionID, b.Etag).Updates(map[string]any{"object_version_id": version, "etag": etag, "updated_at": time.Now().UTC()})
	if result.Error == nil && result.RowsAffected != 1 {
		return assetdomain.ErrConflict
	}
	return result.Error
}

type AssetBlobRepository struct{ *Store }
