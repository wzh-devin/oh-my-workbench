package assets

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	minio "github.com/minio/minio-go/v7"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	s3service "github.com/devin/oh-my-workbench/api/internal/service/s3"
)

func (s *Service) InitUpload(ctx context.Context, userID int64, input assetreq.InitUploadRequest) (repository.AssetUpload, error) {
	if _, err := assetdomain.ParseID(input.ConnectionID); err != nil {
		return repository.AssetUpload{}, err
	}
	if _, err := assetdomain.ParentID(input.ParentID); err != nil {
		return repository.AssetUpload{}, err
	}
	if !assetdomain.ValidName(input.Name) || input.Size < 0 || input.Size > assetdomain.MaxFileSize || !hashPattern.MatchString(input.SHA256) || !assetdomain.ValidText(input.RequestKey, 64) || len(input.ContentType) > 255 || input.LegacyID != nil && !assetdomain.ValidText(*input.LegacyID, 100) {
		return repository.AssetUpload{}, assetdomain.ErrInvalid
	}
	u, err := s.repo.AssetUpload.InitUpload(ctx, userID, input)
	if err != nil || u.Status != "initializing" {
		return u, err
	}
	b, err := s.repo.AssetBlob.DedupBlob(ctx, userID, u.ConnectionID, input.SHA256, input.Size)
	if err == nil {
		c, err := s.repo.AssetConnection.Connection(ctx, userID, u.ConnectionID)
		if err != nil {
			return u, err
		}
		client, err := s.storage(ctx, c)
		if err != nil {
			return u, err
		}
		info, err := client.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID})
		if err == nil && info.Size == b.SizeBytes && info.ETag == b.Etag {
			saved, err := s.repo.AssetUpload.PublishDedup(ctx, userID, u.ID, b.ID)
			if err == nil {
				return saved, nil
			}
			if !errors.Is(err, assetdomain.ErrConflict) {
				return u, err
			}
		}
	} else if !errors.Is(err, assetdomain.ErrNotFound) {
		return u, err
	}
	if err = s.initializeUpload(ctx, u); err != nil && !errors.Is(err, assetdomain.ErrConflict) {
		return u, err
	}
	return s.repo.AssetUpload.Upload(ctx, userID, u.ID)
}

func (s *Service) initializeUpload(ctx context.Context, upload repository.AssetUpload) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	u, err := s.repo.AssetUpload.ClaimUpload(ctx, upload.UserID, upload.ID, []string{"initializing"})
	if err != nil {
		return err
	}
	defer s.releaseUpload(ctx, u)
	c, err := s.repo.AssetConnection.Connection(ctx, u.UserID, u.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		_ = s.repo.AssetUpload.UploadError(ctx, u, err.Error())
		return err
	}
	b, err := s.repo.AssetBlob.Blob(ctx, u.UserID, u.BlobID)
	if err != nil {
		return err
	}
	id := ""
	if u.SizeBytes >= assetdomain.MultipartThreshold {
		id, err = client.Initialize(ctx, c.Bucket, b.ObjectKey)
	}
	if err != nil {
		_ = s.repo.AssetUpload.UploadError(ctx, u, "初始化上传失败，请重试")
		return err
	}
	return s.repo.AssetUpload.UploadState(ctx, u, "uploading", id, "")
}

func (s *Service) Upload(ctx context.Context, userID, id int64) (repository.AssetUpload, error) {
	u, err := s.repo.AssetUpload.Upload(ctx, userID, id)
	if err != nil {
		return u, err
	}
	if (u.Status == "uploading" || u.Status == "paused") && u.S3UploadID != "" {
		c, err := s.repo.AssetConnection.Connection(ctx, userID, u.ConnectionID)
		if err != nil {
			return u, err
		}
		b, err := s.repo.AssetBlob.Blob(ctx, userID, u.BlobID)
		if err != nil {
			return u, err
		}
		client, err := s.storage(ctx, c)
		if err != nil {
			return u, err
		}
		actual, err := client.Parts(ctx, c.Bucket, b.ObjectKey, u.S3UploadID)
		err = storageError(err)
		if err != nil {
			return u, err
		}
		valid := map[int]bool{}
		for _, part := range u.Parts {
			v, ok := actual[part.PartNumber]
			valid[part.PartNumber] = ok && v.Size == part.SizeBytes && v.ETag == part.Etag
		}
		if err = s.repo.AssetUploadPart.ReconcileParts(ctx, u, valid); err != nil && !errors.Is(err, assetdomain.ErrConflict) {
			return u, err
		}
		return s.repo.AssetUpload.Upload(ctx, userID, id)
	}
	return u, nil
}

func (s *Service) PutPart(ctx context.Context, userID, id int64, number int, hash string, size int64, body io.Reader) error {
	if !hashPattern.MatchString(hash) {
		return assetdomain.ErrInvalid
	}
	u, p, err := s.repo.AssetUploadPart.ClaimPart(ctx, userID, id, number, hash)
	if err != nil {
		return err
	}
	finished := p.Status == "ready"
	defer func() {
		if !finished {
			saveCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()
			_ = s.repo.AssetUploadPart.FinishPart(saveCtx, u, p, "", "", false)
		}
	}()
	if p.SizeBytes != size {
		return assetdomain.ErrInvalid
	}
	if p.Status == "ready" {
		return nil
	}
	// 每次流式请求限制两分钟，小于分片租约，清理不会与迟到写入交错。
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	c, err := s.repo.AssetConnection.Connection(ctx, userID, u.ConnectionID)
	if err != nil {
		return err
	}
	b, err := s.repo.AssetBlob.Blob(ctx, userID, u.BlobID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return err
	}
	digest := sha256.New()
	reader := io.TeeReader(io.LimitReader(body, size), digest)
	etag, version := "", ""
	if u.S3UploadID != "" {
		part, putErr := client.Core.PutObjectPart(ctx, c.Bucket, b.ObjectKey, u.S3UploadID, number, reader, size, minio.PutObjectPartOptions{Sha256Hex: hash})
		err = putErr
		etag = part.ETag
	} else {
		info, putErr := client.PutObject(ctx, c.Bucket, b.ObjectKey, reader, size, minio.PutObjectOptions{ContentType: "application/octet-stream", DisableMultipart: true, NumThreads: 1})
		err = putErr
		etag = info.ETag
		version = info.VersionID
	}
	if err == nil && hex.EncodeToString(digest.Sum(nil)) != hash {
		err = fmt.Errorf("%w：分片指纹不匹配", assetdomain.ErrInvalid)
	}
	saveCtx, saveCancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer saveCancel()
	saved := s.repo.AssetUploadPart.FinishPart(saveCtx, u, p, etag, version, err == nil)
	finished = saved == nil
	if err != nil {
		return err
	}
	return saved
}

func (s *Service) processUpload(ctx context.Context, upload repository.AssetUpload) error {
	u, err := s.repo.AssetUpload.ClaimUpload(ctx, upload.UserID, upload.ID, []string{"completing", "verifying"})
	if err != nil {
		return err
	}
	defer s.releaseUpload(ctx, u)
	ctx, cancel := context.WithTimeout(ctx, 30*time.Minute)
	defer cancel()
	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if s.repo.AssetUpload.RenewUpload(ctx, u) != nil {
					cancel()
					return
				}
			}
		}
	}()
	c, err := s.repo.AssetConnection.Connection(ctx, u.UserID, u.ConnectionID)
	if err != nil {
		return err
	}
	b, err := s.repo.AssetBlob.Blob(ctx, u.UserID, u.BlobID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return err
	}
	info, statErr := client.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID})
	if statErr != nil && !s3service.ObjectMissing(statErr) {
		_ = s.repo.AssetUpload.UploadError(ctx, u, "读取上传结果失败，将自动重试")
		return statErr
	}
	if s3service.ObjectMissing(statErr) {
		if len(u.Parts) != u.PartCount {
			return s.repo.AssetUpload.FailUpload(ctx, u, "分片不完整，请恢复上传", false)
		}
		parts := []minio.CompletePart{}
		actual, err := client.Parts(ctx, c.Bucket, b.ObjectKey, u.S3UploadID)
		err = storageError(err)
		if err != nil {
			return err
		}
		for i, p := range u.Parts {
			v, ok := actual[p.PartNumber]
			if p.PartNumber != i+1 || !ok || v.Size != p.SizeBytes || v.ETag != p.Etag {
				return s.repo.AssetUpload.FailUpload(ctx, u, "分片已失效，请重新选择文件重试", false)
			}
			parts = append(parts, minio.CompletePart{PartNumber: p.PartNumber, ETag: p.Etag})
		}
		if u.S3UploadID == "" {
			return s.repo.AssetUpload.FailUpload(ctx, u, "上传内容不存在，请重新上传", false)
		}
		completed, err := client.Core.CompleteMultipartUpload(ctx, c.Bucket, b.ObjectKey, u.S3UploadID, parts, minio.PutObjectOptions{})
		if err != nil {
			_ = s.repo.AssetUpload.UploadError(ctx, u, "合并状态待核对，将自动重试")
			return err
		}
		b.ObjectVersionID = completed.VersionID
		info.VersionID = completed.VersionID
	}
	// 完整文件 SHA-256 只来自实际对象字节；分片哈希与 ETag 均不参与可信索引。
	if err = s.repo.AssetUpload.UploadPhase(ctx, u, "verifying", info.VersionID); err != nil {
		return err
	}
	u.Status = "verifying"
	b.ObjectVersionID = info.VersionID
	info, hash, contentType, err := verifyContent(ctx, client, c, b, u)
	if err != nil {
		if errors.Is(err, assetdomain.ErrInvalid) {
			return s.repo.AssetUpload.FailUpload(ctx, u, err.Error(), true)
		}
		_ = s.repo.AssetUpload.UploadError(ctx, u, "内容校验中断，将自动重试")
		return err
	}
	previousVersion := info.VersionID
	info, err = client.ContentMetadata(ctx, c.Bucket, b.ObjectKey, info, contentType)
	if err != nil {
		_ = s.repo.AssetUpload.UploadError(ctx, u, "保存文件类型失败，将自动重试")
		return err
	}
	// 元数据复制会产生新版本，先保存定位，重启不能退回旧版本。
	if err = s.repo.AssetUpload.UploadPhase(ctx, u, "verifying", info.VersionID); err != nil {
		return err
	}
	if err = s.repo.AssetUpload.VerifiedUpload(ctx, u, hash, contentType, info.ETag, info.VersionID); err != nil {
		message := "保存上传结果失败，将自动重试"
		if errors.Is(err, assetdomain.ErrName) {
			message = "目标目录已存在同名文件，请处理后刷新状态"
		} else if errors.Is(err, assetdomain.ErrNotFound) || errors.Is(err, assetdomain.ErrInvalid) {
			message = "目标目录不可用，请恢复目录后刷新状态"
		}
		_ = s.repo.AssetUpload.UploadError(ctx, u, message)
		return err
	}
	// 发布后才移除未发布的元数据旧版本；失败仍由该Blob的最终清理回收。
	if previousVersion != "" && previousVersion != info.VersionID {
		cleanupCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
		cleanupErr := client.RemoveObject(cleanupCtx, c.Bucket, b.ObjectKey, minio.RemoveObjectOptions{VersionID: previousVersion})
		stop()
		if cleanupErr != nil && !s3service.ObjectMissing(cleanupErr) {
			workerError("清理上传临时版本", cleanupErr)
		}
	}
	return nil
}

func (s *Service) releaseUpload(ctx context.Context, u repository.AssetUpload) {
	cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	_ = s.repo.AssetUpload.ReleaseUpload(cleanup, u)
}

func (s *Service) cleanupUpload(ctx context.Context, upload repository.AssetUpload) error {
	if upload.Status != "cleaning" {
		var err error
		upload, err = s.repo.AssetUpload.ControlUpload(ctx, upload.UserID, upload.ID, "cleaning", 0)
		if err != nil {
			return err
		}
	}
	u, err := s.repo.AssetUpload.ClaimUpload(ctx, upload.UserID, upload.ID, []string{"cleaning"})
	if err != nil {
		return err
	}
	ready, err := s.repo.AssetUpload.UploadCleanupReady(ctx, u)
	if err != nil || !ready {
		_ = s.repo.AssetUpload.UploadError(ctx, u, "等待在途分片结束")
		return err
	}
	c, err := s.repo.AssetConnection.Connection(ctx, u.UserID, u.ConnectionID)
	if err != nil {
		return err
	}
	b, err := s.repo.AssetBlob.Blob(ctx, u.UserID, u.BlobID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return err
	}
	if u.S3UploadID != "" {
		err = client.Core.AbortMultipartUpload(ctx, c.Bucket, b.ObjectKey, u.S3UploadID)
		if err != nil && !s3service.ObjectMissing(err) {
			_ = s.repo.AssetUpload.UploadError(ctx, u, "终止分片失败，将自动重试")
			return err
		}
	}
	if err := storageError(client.AbortKey(ctx, c.Bucket, b.ObjectKey)); err != nil {
		return err
	}

	return s.repo.AssetUpload.ClosedUpload(ctx, u)
}
