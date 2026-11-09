package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
)

type AssetUploadPart struct {
	AssetBase
	UploadID   int64      `json:"-"`
	PartNumber int        `json:"number"`
	SizeBytes  int64      `json:"size"`
	SHA256     string     `json:"sha256"`
	Etag       string     `json:"-"`
	Status     string     `json:"status"`
	LeaseToken string     `json:"-"`
	LeaseUntil *time.Time `json:"-"`
}

func (AssetUploadPart) TableName() string { return "omw_asset_upload_part" }

func (r *AssetUploadPartRepository) ClaimPart(ctx context.Context, userID, id int64, number int, hash string) (AssetUpload, AssetUploadPart, error) {
	var result AssetUpload
	var part AssetUploadPart
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		u, err := tx.AssetUpload.upload(userID, id)
		if err != nil {
			return err
		}
		if u.Status != "uploading" || u.ExpiresAt.Before(time.Now()) {
			return assetdomain.ErrConflict
		}
		if number < 1 || number > u.PartCount {
			return assetdomain.ErrInvalid
		}
		size := u.PartSize
		if number == u.PartCount {
			size = u.SizeBytes - u.PartSize*int64(number-1)
		}
		found := tx.db.Where("user_id=? AND upload_id=? AND part_number=?", userID, id, number).First(&part)
		if found.Error == nil {
			if part.Status == "ready" {
				if part.SHA256 != hash {
					return assetdomain.ErrConflict
				}
				result = u
				return nil
			}
			if part.LeaseUntil != nil && part.LeaseUntil.After(time.Now()) {
				return assetdomain.ErrConflict
			}
		} else if assetsMissing(found.Error) != assetdomain.ErrNotFound {
			return found.Error
		} else {
			part = AssetUploadPart{AssetBase: NewAssetBase(userID), UploadID: id, PartNumber: number}
		}
		until := time.Now().UTC().Add(3 * time.Minute)
		part.Status = "uploading"
		part.LeaseToken = assetdomain.FormatID(NewAssetBase(userID).ID)
		part.LeaseUntil = &until
		part.SizeBytes = size
		part.SHA256 = hash
		part.UpdatedAt = time.Now().UTC()
		if err = tx.db.Save(&part).Error; err != nil {
			return err
		}
		result = u
		return tx.db.Model(&AssetUpload{}).Where("id=?", id).Updates(map[string]any{"expires_at": time.Now().UTC().Add(7 * 24 * time.Hour), "updated_at": time.Now().UTC()}).Error
	})
	return result, part, err
}

func (r *AssetUploadPartRepository) FinishPart(ctx context.Context, u AssetUpload, p AssetUploadPart, etag, version string, success bool) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		current, err := tx.AssetUpload.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		status := "invalid"
		if success && AssetsContains([]string{"uploading", "paused"}, current.Status) {
			status = "ready"
		}
		res := tx.db.Model(&AssetUploadPart{}).Where("id=? AND user_id=? AND lease_token=?", p.ID, u.UserID, p.LeaseToken).Updates(map[string]any{"etag": etag, "status": status, "lease_until": nil, "lease_token": "", "updated_at": time.Now().UTC()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		if version != "" {
			if err = tx.db.Model(&AssetBlob{}).Where("id=? AND user_id=?", u.BlobID, u.UserID).Update("object_version_id", version).Error; err != nil {
				return err
			}
		}
		if success && status != "ready" {
			return assetdomain.ErrConflict
		}
		return nil
	})
}

func (r *AssetUploadPartRepository) ReconcileParts(ctx context.Context, u AssetUpload, valid map[int]bool) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		current, err := tx.AssetUpload.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.Status != "uploading" && current.Status != "paused" {
			return assetdomain.ErrConflict
		}
		for _, part := range current.Parts {
			if !valid[part.PartNumber] {
				if err := tx.db.Model(&AssetUploadPart{}).Where("id=? AND status='ready'", part.ID).Updates(map[string]any{"status": "invalid", "updated_at": time.Now().UTC()}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

type AssetUploadPartRepository struct{ *Store }
