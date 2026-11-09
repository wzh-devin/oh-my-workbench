package repository

import (
	"context"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
)

type AssetUpload struct {
	AssetBase
	ConnectionID   int64             `json:"connectionId,string"`
	BlobID         int64             `json:"-"`
	ParentID       *int64            `json:"parentId,string"`
	FileName       string            `json:"name"`
	ContentType    string            `json:"type"`
	ExpectedSHA256 string            `json:"sha256"`
	SizeBytes      int64             `json:"size"`
	PartSize       int64             `json:"partSize"`
	PartCount      int               `json:"partCount"`
	S3UploadID     string            `json:"-"`
	RequestKey     string            `json:"requestKey"`
	Status         string            `json:"status"`
	ExpiresAt      time.Time         `json:"expiresAt"`
	LastError      string            `json:"error"`
	Version        int               `json:"version"`
	EntryID        *int64            `json:"-"`
	LeaseToken     string            `json:"-"`
	LeaseUntil     *time.Time        `json:"-"`
	LegacyID       *string           `json:"-"`
	Parts          []AssetUploadPart `json:"parts" gorm:"-"`
	Entry          *AssetEntry       `json:"entry,omitempty" gorm:"-"`
}

func (AssetUpload) TableName() string { return "omw_asset_upload" }

// 上传会话和分片的持久化状态与租约，不在传输期间持有事务。
func (r *AssetUploadRepository) upload(userID, id int64) (AssetUpload, error) {
	var u AssetUpload
	err := r.db.Where("user_id=? AND id=?", userID, id).First(&u).Error
	if err != nil {
		return u, assetsMissing(err)
	}
	u.Parts = []AssetUploadPart{}
	err = r.db.Where("user_id=? AND upload_id=? AND status='ready'", userID, id).Order("part_number").Find(&u.Parts).Error
	if u.EntryID != nil {
		e, eErr := r.AssetEntry.entry(userID, *u.EntryID)
		if eErr == nil {
			u.Entry = &e
		}
	}
	return u, err
}

func (r *AssetUploadRepository) Upload(ctx context.Context, userID, id int64) (AssetUpload, error) {
	return New(r.db.WithContext(ctx), nil).AssetUpload.upload(userID, id)
}

func (r *AssetUploadRepository) Uploads(ctx context.Context, userID int64) ([]AssetUpload, error) {
	uploads := []AssetUpload{}
	err := r.db.WithContext(ctx).Where("user_id=? AND status NOT IN ('completed','closed')", userID).Order("created_at DESC,id DESC").Limit(200).Find(&uploads).Error
	return uploads, err
}

// LookupUpload 与初始化共用用户锁，取消响应丢失的初始化请求时不会漏掉已提交会话。
func (r *AssetUploadRepository) LookupUpload(ctx context.Context, userID int64, key string) ([]AssetUpload, error) {
	uploads := []AssetUpload{}
	if !assetdomain.ValidText(key, 64) {
		return uploads, assetdomain.ErrInvalid
	}
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		return tx.db.Where("user_id=? AND request_key=?", userID, key).Find(&uploads).Error
	})
	return uploads, err
}

func (r *AssetUploadRepository) InitUpload(ctx context.Context, userID int64, input assetreq.InitUploadRequest) (AssetUpload, error) {
	var result AssetUpload
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		var old AssetUpload
		found := tx.db.Where("user_id=? AND request_key=?", userID, input.RequestKey).First(&old)
		if found.Error == nil {
			parent, err := assetdomain.ParentID(input.ParentID)
			if err != nil || old.ConnectionID != assetsMustID(input.ConnectionID) || !assetdomain.SameParent(old.ParentID, parent) || old.FileName != input.Name || old.SizeBytes != input.Size || old.ExpectedSHA256 != input.SHA256 {
				return assetdomain.ErrConflict
			}
			var err2 error
			result, err2 = tx.AssetUpload.upload(userID, old.ID)
			return err2
		}
		if assetsMissing(found.Error) != assetdomain.ErrNotFound {
			return found.Error
		}
		connectionID, _ := assetdomain.ParseID(input.ConnectionID)
		c, err := tx.AssetConnection.FindConnection(userID, connectionID)
		if err != nil || !c.Enabled {
			return assetdomain.ErrNotFound
		}
		parent, err := assetdomain.ParentID(input.ParentID)
		if err != nil {
			return err
		}
		if input.LegacyID != nil {
			var e AssetEntry
			if tx.db.Where("user_id=? AND legacy_id=?", userID, *input.LegacyID).First(&e).Error == nil {
				result = AssetUpload{AssetBase: NewAssetBase(userID), Status: "completed", Entry: &e}
				return nil
			}
		}
		all, err := tx.AssetEntry.directoryEntries(userID, connectionID, parent)
		if err != nil {
			return err
		}
		entries := AssetEntryMap(all)
		if _, err = AssetDirectoryDepth(parent, entries); err != nil {
			return err
		}

		names, err := tx.AssetEntry.uploadNames(all, userID, connectionID, parent, 0)
		if err != nil {
			return err
		}
		if suggested := assetdomain.UploadName(input.Name, names); suggested != input.Name {
			return &assetdomain.UploadNameConflict{SuggestedName: suggested}
		}
		b := AssetBlob{AssetBase: NewAssetBase(userID), ConnectionID: connectionID, SizeBytes: input.Size, Status: "uploading", NextRetryAt: time.Now().UTC()}
		b.ObjectKey = AssetObjectKey(c, b.ID, input.Name)
		u := AssetUpload{AssetBase: NewAssetBase(userID), ConnectionID: connectionID, BlobID: b.ID, ParentID: parent, FileName: input.Name, ContentType: input.ContentType, ExpectedSHA256: input.SHA256, SizeBytes: input.Size, PartSize: assetdomain.PartSize, RequestKey: input.RequestKey, Status: "initializing", ExpiresAt: time.Now().UTC().Add(7 * 24 * time.Hour), Version: 1, LegacyID: input.LegacyID}
		if input.Size < assetdomain.MultipartThreshold {
			u.PartSize = input.Size
			u.PartCount = 1
		} else {
			u.PartCount = int((input.Size + assetdomain.PartSize - 1) / assetdomain.PartSize)
		}
		if err = tx.db.Create(&b).Error; err != nil {
			return err
		}
		if err = tx.db.Create(&u).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}

func (r *AssetUploadRepository) PublishDedup(ctx context.Context, userID, uploadID, blobID int64) (AssetUpload, error) {
	var result AssetUpload
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		u, err := tx.AssetUpload.upload(userID, uploadID)
		if err != nil {
			return err
		}
		if u.Status == "completed" {
			result = u
			return nil
		}
		if u.Status != "initializing" {
			return assetdomain.ErrConflict
		}
		var b AssetBlob
		if err = tx.db.Where("id=? AND user_id=? AND connection_id=? AND status='ready' AND verified_at IS NOT NULL", blobID, userID, u.ConnectionID).First(&b).Error; err != nil {
			return assetdomain.ErrConflict
		}
		if b.SHA256 == nil || *b.SHA256 != u.ExpectedSHA256 || b.SizeBytes != u.SizeBytes {
			return assetdomain.ErrConflict
		}
		oldBlob := u.BlobID
		u.BlobID = blobID
		var source AssetEntry
		if err = tx.db.Where("user_id=? AND blob_id=? AND status='ready'", userID, blobID).Order("id").First(&source).Error; err != nil {
			return assetsMissing(err)
		}
		u.ContentType = source.ContentType
		if err = tx.AssetUpload.publishUpload(&u, b); err != nil {
			return err
		}
		if err = tx.db.Model(&AssetBlob{}).Where("id=? AND user_id=?", oldBlob, userID).Updates(map[string]any{"status": "cleaning", "updated_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}

func (r *AssetUploadRepository) publishUpload(u *AssetUpload, b AssetBlob) error {
	all, err := r.AssetEntry.directoryEntries(u.UserID, u.ConnectionID, u.ParentID)
	if err != nil {
		return err
	}
	entries := AssetEntryMap(all)
	if _, err = AssetDirectoryDepth(u.ParentID, entries); err != nil {
		return err
	}
	names, err := r.AssetEntry.uploadNames(all, u.UserID, u.ConnectionID, u.ParentID, u.ID)
	if err != nil {
		return err
	}
	// 发布期间发生重命名等竞争时继续递增；会话原名不变，保证初始化重放幂等。
	name := assetdomain.UploadName(u.FileName, names)
	e := AssetEntry{AssetBase: NewAssetBase(u.UserID), ConnectionID: u.ConnectionID, ParentID: u.ParentID, Kind: "file", Name: name, NormalizedName: assetdomain.NormalizeName(name), BlobID: &b.ID, ContentType: u.ContentType, Version: 1, Status: "ready", LegacyID: u.LegacyID}
	e.Size = b.SizeBytes
	if err = r.db.Create(&e).Error; err != nil {
		return err
	}
	if err = r.AssetPreview.queueThumbnails([]AssetEntry{e}); err != nil {
		return err
	}
	u.EntryID = &e.ID
	u.Entry = &e
	u.Status = "completed"
	u.UpdatedAt = time.Now().UTC()
	u.LeaseToken = ""
	u.LeaseUntil = nil
	u.LastError = ""
	u.Version++
	return r.db.Save(u).Error
}

func (r *AssetUploadRepository) ClaimUpload(ctx context.Context, userID, id int64, states []string) (AssetUpload, error) {
	var result AssetUpload
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		u, err := tx.AssetUpload.upload(userID, id)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		if u.LeaseUntil != nil && u.LeaseUntil.After(now) || !AssetsContains(states, u.Status) {
			return assetdomain.ErrConflict
		}
		u.LeaseToken = assetdomain.FormatID(NewAssetBase(userID).ID)
		until := now.Add(3 * time.Minute)
		u.LeaseUntil = &until
		u.UpdatedAt = now
		if err = tx.db.Save(&u).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}

func (r *AssetUploadRepository) RenewUpload(ctx context.Context, u AssetUpload) error {
	until := time.Now().UTC().Add(3 * time.Minute)
	res := r.db.WithContext(ctx).Model(&AssetUpload{}).Where("id=? AND user_id=? AND lease_token=? AND status IN ('initializing','completing','verifying')", u.ID, u.UserID, u.LeaseToken).Update("lease_until", until)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return assetdomain.ErrConflict
	}
	return nil
}

// ReleaseUpload 只释放本次执行的租约，不清除已经写入的失败退避时间。
func (r *AssetUploadRepository) ReleaseUpload(ctx context.Context, u AssetUpload) error {
	return r.db.WithContext(ctx).Model(&AssetUpload{}).Where("user_id=? AND id=? AND lease_token=?", u.UserID, u.ID, u.LeaseToken).Updates(map[string]any{"lease_token": "", "lease_until": nil}).Error
}

func (r *AssetUploadRepository) UploadPhase(ctx context.Context, u AssetUpload, status, version string) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		result := tx.db.Model(&AssetUpload{}).Where("user_id=? AND id=? AND lease_token=? AND status IN ('completing','verifying')", u.UserID, u.ID, u.LeaseToken).Updates(map[string]any{"status": status, "updated_at": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return assetdomain.ErrConflict
		}
		return tx.db.Model(&AssetBlob{}).Where("user_id=? AND id=?", u.UserID, u.BlobID).Update("object_version_id", version).Error
	})
}

func (r *AssetUploadRepository) UploadState(ctx context.Context, u AssetUpload, status, uploadID, message string) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		current, err := tx.AssetUpload.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.LeaseToken != u.LeaseToken || current.Status == "cleaning" || current.Status == "closed" {
			return assetdomain.ErrConflict
		}
		current.Status = status
		if uploadID != "" {
			current.S3UploadID = uploadID
		}
		current.LastError = message
		current.LeaseToken = ""
		current.LeaseUntil = nil
		current.UpdatedAt = time.Now().UTC()
		current.ExpiresAt = current.UpdatedAt.Add(7 * 24 * time.Hour)
		current.Version++
		return tx.db.Save(&current).Error
	})
}

func (r *AssetUploadRepository) ControlUpload(ctx context.Context, userID, id int64, status string, version int) (AssetUpload, error) {
	var result AssetUpload
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		u, err := tx.AssetUpload.upload(userID, id)
		if err != nil {
			return err
		}
		if version != 0 && version != u.Version {
			return assetdomain.ErrConflict
		}
		if u.Status == "completed" || u.Status == "closed" {
			result = u
			return nil
		}
		if status != "cleaning" && u.Status != "uploading" && u.Status != "paused" && u.Status != "failed" {
			return assetdomain.ErrConflict
		}
		u.Status = status
		u.Version++
		u.UpdatedAt = time.Now().UTC()
		u.ExpiresAt = u.UpdatedAt.Add(7 * 24 * time.Hour)
		if status != "cleaning" {
			u.LastError = ""
		}
		if err = tx.db.Save(&u).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}

func (r *AssetUploadRepository) CompleteRequest(ctx context.Context, userID, id int64) (AssetUpload, error) {
	var result AssetUpload
	err := r.AssetEntry.Write(ctx, userID, func(tx *Store) error {
		u, err := tx.AssetUpload.upload(userID, id)
		if err != nil {
			return err
		}
		if AssetsContains([]string{"completed", "completing", "verifying"}, u.Status) {
			result = u
			return nil
		}
		if u.Status != "uploading" || len(u.Parts) != u.PartCount {
			return assetdomain.ErrConflict
		}
		u.Status = "completing"
		u.UpdatedAt = time.Now().UTC()
		u.Version++
		if err = tx.db.Save(&u).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}

func (r *AssetUploadRepository) VerifiedUpload(ctx context.Context, u AssetUpload, hash, contentType, etag, version string) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		current, err := tx.AssetUpload.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.LeaseToken != u.LeaseToken || !AssetsContains([]string{"completing", "verifying"}, current.Status) {
			return assetdomain.ErrConflict
		}
		var b AssetBlob
		if err = tx.db.Where("id=? AND user_id=?", u.BlobID, u.UserID).First(&b).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		b.SHA256 = &hash
		b.Status = "ready"
		b.VerifiedAt = &now
		b.Etag = etag
		b.ObjectVersionID = version
		b.UpdatedAt = now
		if err = tx.db.Save(&b).Error; err != nil {
			return err
		}
		current.ContentType = contentType
		return tx.AssetUpload.publishUpload(&current, b)
	})
}

func (r *AssetUploadRepository) PendingUploads(ctx context.Context) ([]AssetUpload, error) {
	uploads := []AssetUpload{}
	err := r.db.WithContext(ctx).Where("status IN ('initializing','completing','verifying','cleaning') OR (status IN ('uploading','paused','failed') AND expires_at<now())").Order("updated_at,id").Limit(20).Find(&uploads).Error
	return uploads, err
}

func (r *AssetUploadRepository) FailUpload(ctx context.Context, u AssetUpload, message string, clean bool) error {
	status := "failed"
	if clean {
		status = "cleaning"
	}
	return r.UploadState(ctx, u, status, "", message)
}

func (r *AssetUploadRepository) UploadCleanupReady(ctx context.Context, u AssetUpload) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&AssetUploadPart{}).Where("upload_id=? AND user_id=? AND lease_until>now()", u.ID, u.UserID).Count(&count).Error
	return count == 0, err
}

func (r *AssetUploadRepository) ClosedUpload(ctx context.Context, u AssetUpload) error {
	return r.AssetEntry.Write(ctx, u.UserID, func(tx *Store) error {
		var current AssetUpload
		if err := tx.db.Where("id=? AND user_id=? AND status='cleaning' AND lease_token=?", u.ID, u.UserID, u.LeaseToken).First(&current).Error; err != nil {
			return assetsMissing(err)
		}
		if err := tx.db.Model(&AssetBlob{}).Where("id=? AND user_id=? AND status<>'ready'", u.BlobID, u.UserID).Updates(map[string]any{"status": "cleaning", "next_retry_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		return tx.db.Model(&current).Updates(map[string]any{"status": "closed", "lease_token": "", "lease_until": nil, "updated_at": time.Now().UTC()}).Error
	})
}

func (r *AssetUploadRepository) UploadError(ctx context.Context, u AssetUpload, message string) error {
	res := r.db.WithContext(ctx).Model(&AssetUpload{}).Where("id=? AND user_id=? AND lease_token=?", u.ID, u.UserID, u.LeaseToken).Updates(map[string]any{"last_error": message, "lease_token": "", "lease_until": time.Now().UTC().Add(time.Minute), "updated_at": time.Now().UTC()})
	return res.Error
}

type AssetUploadRepository struct{ *Store }
