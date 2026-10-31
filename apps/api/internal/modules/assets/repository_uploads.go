// 上传会话和分片的持久化状态与租约，不在传输期间持有事务。
package assets

import (
	"context"
	"time"
)

func (r *Repository) upload(userID, id int64) (Upload, error) {
	var u Upload
	err := r.db.Where("user_id=? AND id=?", userID, id).First(&u).Error
	if err != nil {
		return u, missing(err)
	}
	u.Parts = []Part{}
	err = r.db.Where("user_id=? AND upload_id=? AND status='ready'", userID, id).Order("part_number").Find(&u.Parts).Error
	if u.EntryID != nil {
		e, eErr := r.entry(userID, *u.EntryID)
		if eErr == nil {
			u.Entry = &e
		}
	}
	return u, err
}
func (r *Repository) Upload(ctx context.Context, userID, id int64) (Upload, error) {
	return NewRepository(r.db.WithContext(ctx)).upload(userID, id)
}
func (r *Repository) Uploads(ctx context.Context, userID int64) ([]Upload, error) {
	uploads := []Upload{}
	err := r.db.WithContext(ctx).Where("user_id=? AND status NOT IN ('completed','closed')", userID).Order("created_at DESC,id DESC").Limit(200).Find(&uploads).Error
	return uploads, err
}

// LookupUpload 与初始化共用用户锁，取消响应丢失的初始化请求时不会漏掉已提交会话。
func (r *Repository) LookupUpload(ctx context.Context, userID int64, key string) ([]Upload, error) {
	uploads := []Upload{}
	if !validText(key, 64) {
		return uploads, ErrInvalid
	}
	err := r.Write(ctx, userID, func(tx *Repository) error {
		return tx.db.Where("user_id=? AND request_key=?", userID, key).Find(&uploads).Error
	})
	return uploads, err
}
func (r *Repository) Blob(ctx context.Context, userID, id int64) (Blob, error) {
	var b Blob
	err := r.db.WithContext(ctx).Where("user_id=? AND id=?", userID, id).First(&b).Error
	return b, missing(err)
}
func (r *Repository) InitUpload(ctx context.Context, userID int64, input UploadInput) (Upload, error) {
	var result Upload
	err := r.Write(ctx, userID, func(tx *Repository) error {
		var old Upload
		found := tx.db.Where("user_id=? AND request_key=?", userID, input.RequestKey).First(&old)
		if found.Error == nil {
			parent, err := parentID(input.ParentID)
			if err != nil || old.ConnectionID != mustID(input.ConnectionID) || !sameParent(old.ParentID, parent) || old.FileName != input.Name || old.SizeBytes != input.Size || old.ExpectedSHA256 != input.SHA256 {
				return ErrConflict
			}
			var err2 error
			result, err2 = tx.upload(userID, old.ID)
			return err2
		}
		if missing(found.Error) != ErrNotFound {
			return found.Error
		}
		connectionID, _ := parseID(input.ConnectionID)
		c, err := tx.connection(userID, connectionID)
		if err != nil || !c.Enabled {
			return ErrNotFound
		}
		parent, err := parentID(input.ParentID)
		if err != nil {
			return err
		}
		if input.LegacyID != nil {
			var e Entry
			if tx.db.Where("user_id=? AND legacy_id=?", userID, *input.LegacyID).First(&e).Error == nil {
				result = Upload{Base: base(userID), Status: "completed", Entry: &e}
				return nil
			}
		}
		all, err := tx.directoryEntries(userID, connectionID, parent)
		if err != nil {
			return err
		}
		entries := entryMap(all)
		if _, err = directoryDepth(parent, entries); err != nil {
			return err
		}

		names, err := tx.uploadNames(all, userID, connectionID, parent, 0)
		if err != nil {
			return err
		}
		if suggested := uploadName(input.Name, names); suggested != input.Name {
			return &UploadNameConflict{SuggestedName: suggested}
		}
		b := Blob{Base: base(userID), ConnectionID: connectionID, SizeBytes: input.Size, Status: "uploading", NextRetryAt: time.Now().UTC()}
		b.ObjectKey = objectKey(c, b.ID, input.Name)
		u := Upload{Base: base(userID), ConnectionID: connectionID, BlobID: b.ID, ParentID: parent, FileName: input.Name, ContentType: input.ContentType, ExpectedSHA256: input.SHA256, SizeBytes: input.Size, PartSize: partSize, RequestKey: input.RequestKey, Status: "initializing", ExpiresAt: time.Now().UTC().Add(7 * 24 * time.Hour), Version: 1, LegacyID: input.LegacyID}
		if input.Size < multipartThreshold {
			u.PartSize = input.Size
			u.PartCount = 1
		} else {
			u.PartCount = int((input.Size + partSize - 1) / partSize)
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
func mustID(value string) int64 { id, _ := parseID(value); return id }
func (r *Repository) DedupBlob(ctx context.Context, userID, connectionID int64, hash string, size int64) (Blob, error) {
	var b Blob
	err := r.db.WithContext(ctx).Where("user_id=? AND connection_id=? AND sha256=? AND size_bytes=? AND status='ready' AND verified_at IS NOT NULL", userID, connectionID, hash, size).Order("id").First(&b).Error
	return b, missing(err)
}
func (r *Repository) PublishDedup(ctx context.Context, userID, uploadID, blobID int64) (Upload, error) {
	var result Upload
	err := r.Write(ctx, userID, func(tx *Repository) error {
		u, err := tx.upload(userID, uploadID)
		if err != nil {
			return err
		}
		if u.Status == "completed" {
			result = u
			return nil
		}
		if u.Status != "initializing" {
			return ErrConflict
		}
		var b Blob
		if err = tx.db.Where("id=? AND user_id=? AND connection_id=? AND status='ready' AND verified_at IS NOT NULL", blobID, userID, u.ConnectionID).First(&b).Error; err != nil {
			return ErrConflict
		}
		if b.SHA256 == nil || *b.SHA256 != u.ExpectedSHA256 || b.SizeBytes != u.SizeBytes {
			return ErrConflict
		}
		oldBlob := u.BlobID
		u.BlobID = blobID
		var source Entry
		if err = tx.db.Where("user_id=? AND blob_id=? AND status='ready'", userID, blobID).Order("id").First(&source).Error; err != nil {
			return missing(err)
		}
		u.ContentType = source.ContentType
		if err = tx.publishUpload(&u, b); err != nil {
			return err
		}
		if err = tx.db.Model(&Blob{}).Where("id=? AND user_id=?", oldBlob, userID).Updates(map[string]any{"status": "cleaning", "updated_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		result = u
		return nil
	})
	return result, err
}
func (r *Repository) publishUpload(u *Upload, b Blob) error {
	all, err := r.directoryEntries(u.UserID, u.ConnectionID, u.ParentID)
	if err != nil {
		return err
	}
	entries := entryMap(all)
	if _, err = directoryDepth(u.ParentID, entries); err != nil {
		return err
	}
	names, err := r.uploadNames(all, u.UserID, u.ConnectionID, u.ParentID, u.ID)
	if err != nil {
		return err
	}
	// 发布期间发生重命名等竞争时继续递增；会话原名不变，保证初始化重放幂等。
	name := uploadName(u.FileName, names)
	e := Entry{Base: base(u.UserID), ConnectionID: u.ConnectionID, ParentID: u.ParentID, Kind: "file", Name: name, NormalizedName: normalizeName(name), BlobID: &b.ID, ContentType: u.ContentType, Version: 1, Status: "ready", LegacyID: u.LegacyID}
	e.Size = b.SizeBytes
	if err = r.db.Create(&e).Error; err != nil {
		return err
	}
	if err = r.queueThumbnails([]Entry{e}); err != nil {
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

// 用户写锁内读取同目录的占用名，包括尚未发布的上传，避免批次内同名竞争。
func (r *Repository) uploadNames(entries []Entry, userID, connectionID int64, parent *int64, exclude int64) (map[string]bool, error) {
	names := map[string]bool{}
	for _, entry := range entries {
		if entry.TrashedAt == nil && sameParent(entry.ParentID, parent) {
			names[normalizeName(entry.Name)] = true
		}
	}
	query := r.db.Model(&Upload{}).Where("user_id=? AND connection_id=? AND id<>? AND status IN ('initializing','uploading','paused','completing','verifying','failed') AND expires_at>?", userID, connectionID, exclude, time.Now().UTC())
	if parent == nil {
		query = query.Where("parent_id IS NULL")
	} else {
		query = query.Where("parent_id=?", *parent)
	}
	var reserved []string
	if err := query.Pluck("file_name", &reserved).Error; err != nil {
		return nil, err
	}
	for _, name := range reserved {
		names[normalizeName(name)] = true
	}
	return names, nil
}
func (r *Repository) ClaimUpload(ctx context.Context, userID, id int64, states []string) (Upload, error) {
	var result Upload
	err := r.Write(ctx, userID, func(tx *Repository) error {
		u, err := tx.upload(userID, id)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		if u.LeaseUntil != nil && u.LeaseUntil.After(now) || !contains(states, u.Status) {
			return ErrConflict
		}
		u.LeaseToken = formatID(base(userID).ID)
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
func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func (r *Repository) RenewUpload(ctx context.Context, u Upload) error {
	until := time.Now().UTC().Add(3 * time.Minute)
	res := r.db.WithContext(ctx).Model(&Upload{}).Where("id=? AND user_id=? AND lease_token=? AND status IN ('initializing','completing','verifying')", u.ID, u.UserID, u.LeaseToken).Update("lease_until", until)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return ErrConflict
	}
	return nil
}

// ReleaseUpload 只释放本次执行的租约，不清除已经写入的失败退避时间。
func (r *Repository) ReleaseUpload(ctx context.Context, u Upload) error {
	return r.db.WithContext(ctx).Model(&Upload{}).Where("user_id=? AND id=? AND lease_token=?", u.UserID, u.ID, u.LeaseToken).Updates(map[string]any{"lease_token": "", "lease_until": nil}).Error
}
func (r *Repository) UploadPhase(ctx context.Context, u Upload, status, version string) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		result := tx.db.Model(&Upload{}).Where("user_id=? AND id=? AND lease_token=? AND status IN ('completing','verifying')", u.UserID, u.ID, u.LeaseToken).Updates(map[string]any{"status": status, "updated_at": time.Now().UTC()})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrConflict
		}
		return tx.db.Model(&Blob{}).Where("user_id=? AND id=?", u.UserID, u.BlobID).Update("object_version_id", version).Error
	})
}
func (r *Repository) UploadState(ctx context.Context, u Upload, status, uploadID, message string) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		current, err := tx.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.LeaseToken != u.LeaseToken || current.Status == "cleaning" || current.Status == "closed" {
			return ErrConflict
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
func (r *Repository) ControlUpload(ctx context.Context, userID, id int64, status string, version int) (Upload, error) {
	var result Upload
	err := r.Write(ctx, userID, func(tx *Repository) error {
		u, err := tx.upload(userID, id)
		if err != nil {
			return err
		}
		if version != 0 && version != u.Version {
			return ErrConflict
		}
		if u.Status == "completed" || u.Status == "closed" {
			result = u
			return nil
		}
		if status != "cleaning" && u.Status != "uploading" && u.Status != "paused" && u.Status != "failed" {
			return ErrConflict
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
func (r *Repository) ClaimPart(ctx context.Context, userID, id int64, number int, hash string) (Upload, Part, error) {
	var result Upload
	var part Part
	err := r.Write(ctx, userID, func(tx *Repository) error {
		u, err := tx.upload(userID, id)
		if err != nil {
			return err
		}
		if u.Status != "uploading" || u.ExpiresAt.Before(time.Now()) {
			return ErrConflict
		}
		if number < 1 || number > u.PartCount {
			return ErrInvalid
		}
		size := u.PartSize
		if number == u.PartCount {
			size = u.SizeBytes - u.PartSize*int64(number-1)
		}
		found := tx.db.Where("user_id=? AND upload_id=? AND part_number=?", userID, id, number).First(&part)
		if found.Error == nil {
			if part.Status == "ready" {
				if part.SHA256 != hash {
					return ErrConflict
				}
				result = u
				return nil
			}
			if part.LeaseUntil != nil && part.LeaseUntil.After(time.Now()) {
				return ErrConflict
			}
		} else if missing(found.Error) != ErrNotFound {
			return found.Error
		} else {
			part = Part{Base: base(userID), UploadID: id, PartNumber: number}
		}
		until := time.Now().UTC().Add(3 * time.Minute)
		part.Status = "uploading"
		part.LeaseToken = formatID(base(userID).ID)
		part.LeaseUntil = &until
		part.SizeBytes = size
		part.SHA256 = hash
		part.UpdatedAt = time.Now().UTC()
		if err = tx.db.Save(&part).Error; err != nil {
			return err
		}
		result = u
		return tx.db.Model(&Upload{}).Where("id=?", id).Updates(map[string]any{"expires_at": time.Now().UTC().Add(7 * 24 * time.Hour), "updated_at": time.Now().UTC()}).Error
	})
	return result, part, err
}
func (r *Repository) FinishPart(ctx context.Context, u Upload, p Part, etag, version string, success bool) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		current, err := tx.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		status := "invalid"
		if success && contains([]string{"uploading", "paused"}, current.Status) {
			status = "ready"
		}
		res := tx.db.Model(&Part{}).Where("id=? AND user_id=? AND lease_token=?", p.ID, u.UserID, p.LeaseToken).Updates(map[string]any{"etag": etag, "status": status, "lease_until": nil, "lease_token": "", "updated_at": time.Now().UTC()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrConflict
		}
		if version != "" {
			if err = tx.db.Model(&Blob{}).Where("id=? AND user_id=?", u.BlobID, u.UserID).Update("object_version_id", version).Error; err != nil {
				return err
			}
		}
		if success && status != "ready" {
			return ErrConflict
		}
		return nil
	})
}
func (r *Repository) ReconcileParts(ctx context.Context, u Upload, valid map[int]bool) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		current, err := tx.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.Status != "uploading" && current.Status != "paused" {
			return ErrConflict
		}
		for _, part := range current.Parts {
			if !valid[part.PartNumber] {
				if err := tx.db.Model(&Part{}).Where("id=? AND status='ready'", part.ID).Updates(map[string]any{"status": "invalid", "updated_at": time.Now().UTC()}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
func (r *Repository) CompleteRequest(ctx context.Context, userID, id int64) (Upload, error) {
	var result Upload
	err := r.Write(ctx, userID, func(tx *Repository) error {
		u, err := tx.upload(userID, id)
		if err != nil {
			return err
		}
		if contains([]string{"completed", "completing", "verifying"}, u.Status) {
			result = u
			return nil
		}
		if u.Status != "uploading" || len(u.Parts) != u.PartCount {
			return ErrConflict
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
func (r *Repository) VerifiedUpload(ctx context.Context, u Upload, hash, contentType, etag, version string) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		current, err := tx.upload(u.UserID, u.ID)
		if err != nil {
			return err
		}
		if current.LeaseToken != u.LeaseToken || !contains([]string{"completing", "verifying"}, current.Status) {
			return ErrConflict
		}
		var b Blob
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
		return tx.publishUpload(&current, b)
	})
}
func (r *Repository) PendingUploads(ctx context.Context) ([]Upload, error) {
	uploads := []Upload{}
	err := r.db.WithContext(ctx).Where("status IN ('initializing','completing','verifying','cleaning') OR (status IN ('uploading','paused','failed') AND expires_at<now())").Order("updated_at,id").Limit(20).Find(&uploads).Error
	return uploads, err
}
func (r *Repository) FailUpload(ctx context.Context, u Upload, message string, clean bool) error {
	status := "failed"
	if clean {
		status = "cleaning"
	}
	return r.UploadState(ctx, u, status, "", message)
}
func (r *Repository) UploadCleanupReady(ctx context.Context, u Upload) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&Part{}).Where("upload_id=? AND user_id=? AND lease_until>now()", u.ID, u.UserID).Count(&count).Error
	return count == 0, err
}
func (r *Repository) ClosedUpload(ctx context.Context, u Upload) error {
	return r.Write(ctx, u.UserID, func(tx *Repository) error {
		var current Upload
		if err := tx.db.Where("id=? AND user_id=? AND status='cleaning' AND lease_token=?", u.ID, u.UserID, u.LeaseToken).First(&current).Error; err != nil {
			return missing(err)
		}
		if err := tx.db.Model(&Blob{}).Where("id=? AND user_id=? AND status<>'ready'", u.BlobID, u.UserID).Updates(map[string]any{"status": "cleaning", "next_retry_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		return tx.db.Model(&current).Updates(map[string]any{"status": "closed", "lease_token": "", "lease_until": nil, "updated_at": time.Now().UTC()}).Error
	})
}
func (r *Repository) UploadError(ctx context.Context, u Upload, message string) error {
	res := r.db.WithContext(ctx).Model(&Upload{}).Where("id=? AND user_id=? AND lease_token=?", u.ID, u.UserID, u.LeaseToken).Updates(map[string]any{"last_error": message, "lease_token": "", "lease_until": time.Now().UTC().Add(time.Minute), "updated_at": time.Now().UTC()})
	return res.Error
}
