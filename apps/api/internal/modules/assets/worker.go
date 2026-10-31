// 上传恢复、对象清理和预览各自运行，慢转换不会阻塞上传与清理。
package assets

import (
	"context"
	"errors"
	"log"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
)

func (s *Service) Run(ctx context.Context) {
	var group sync.WaitGroup
	for _, work := range []func(context.Context){s.uploadWork, s.cleanupWork, s.previewWork, s.thumbnailWork, s.thumbnailWork, s.thumbnailBackfill} {
		group.Go(func() {
			ticker := time.NewTicker(5 * time.Second)
			defer ticker.Stop()
			for {
				work(ctx)
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
				}
			}
		})
	}
	group.Wait()
}
func workerError(kind string, err error) {
	if err != nil && !errors.Is(err, ErrConflict) && !errors.Is(err, context.Canceled) {
		log.Printf("资产%s任务失败: %v", kind, err)
	}
}
func (s *Service) uploadWork(ctx context.Context) {
	uploads, err := s.repo.PendingUploads(ctx)
	if err != nil {
		workerError("读取上传", err)
		return
	}
	for _, u := range uploads {
		if ctx.Err() != nil {
			return
		}
		job, cancel := context.WithTimeout(ctx, 2*time.Minute)
		switch u.Status {
		case "initializing":
			err = s.initializeUpload(job, u)
		case "completing", "verifying":
			cancel()
			err = s.processUpload(ctx, u)
		default:
			err = s.cleanupUpload(job, u)
		}
		cancel()
		workerError("上传", err)
	}
}
func (s *Service) cleanupWork(ctx context.Context) {
	blobs, err := s.repo.CleanupBlobs(ctx)
	if err != nil {
		workerError("读取清理", err)
		return
	}
	for _, b := range blobs {
		job, cancel := context.WithTimeout(ctx, 2*time.Minute)
		workerError("清理", s.cleanupBlob(job, b))
		cancel()
		if ctx.Err() != nil {
			return
		}
	}
}
func (s *Service) previewWork(ctx context.Context) {
	if s.converterURL == "" || !s.rendererAvailable(ctx, "/health") {
		return
	}
	previews, err := s.repo.PendingPreviews(ctx)
	if err != nil {
		workerError("读取预览", err)
		return
	}
	for _, p := range previews {
		workerError("预览", s.convertPreview(ctx, p))
		if ctx.Err() != nil {
			return
		}
	}
}

func (s *Service) thumbnailBackfill(ctx context.Context) {
	entries, err := s.repo.ThumbnailBackfill(ctx, s.thumbnailCursor)
	if err != nil {
		workerError("补齐缩略图", err)
		return
	}
	if len(entries) == 0 {
		s.thumbnailCursor = 0
		return
	}
	byUser := map[int64][]Entry{}
	for _, e := range entries {
		byUser[e.UserID] = append(byUser[e.UserID], e)
	}
	for userID, page := range byUser {
		if err := s.repo.QueueThumbnails(ctx, userID, page, false); err != nil {
			workerError("补齐缩略图", err)
			return
		}
	}
	s.thumbnailCursor = entries[len(entries)-1].ID
}

// 终止该Key未完成的分片会话，覆盖转换写入失败后的服务端残留。
func (client *storage) abortKey(ctx context.Context, c Connection, key string) error {
	for {
		result, err := client.core.ListMultipartUploads(ctx, c.Bucket, key, "", "", "", 1000)
		if err != nil {
			return err
		}
		found := false
		for _, part := range result.Uploads {
			if part.Key == key {
				found = true
				if err = client.core.AbortMultipartUpload(ctx, c.Bucket, key, part.UploadID); err != nil && !objectMissing(err) {
					return err
				}
			}
		}
		if !found {
			return nil
		}
	}
}
func (client *storage) deleteKey(ctx context.Context, c Connection, key string) error {
	if err := client.abortKey(ctx, c, key); err != nil {
		return err
	}
	// ListObjectVersions 同时覆盖未知的迟到版本与删除标记，始终仅删除该稳定 Key。
	for object := range client.ListObjects(ctx, c.Bucket, minio.ListObjectsOptions{Prefix: key, Recursive: true, WithVersions: true}) {
		if object.Err != nil {
			return object.Err
		}
		if object.Key != key {
			continue
		}
		if err := client.RemoveObject(ctx, c.Bucket, key, minio.RemoveObjectOptions{VersionID: object.VersionID}); err != nil && !objectMissing(err) {
			return err
		}
	}
	for object := range client.ListObjects(ctx, c.Bucket, minio.ListObjectsOptions{Prefix: key, Recursive: true, WithVersions: true}) {
		if object.Err != nil {
			return object.Err
		}
		if object.Key == key {
			return ErrConflict
		}
	}
	return nil
}
func (s *Service) cleanupBlob(ctx context.Context, blob Blob) error {
	b, err := s.repo.ClaimBlob(ctx, blob)
	if err != nil {
		return err
	}
	c, err := s.repo.Connection(ctx, b.UserID, b.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(c)
	if err != nil {
		return err
	}
	previews, err := s.repo.BlobPreviews(ctx, b)
	if err != nil {
		return err
	}
	for _, p := range previews {
		if p.LeaseUntil != nil && p.LeaseUntil.After(time.Now()) {
			err = ErrConflict
			break
		}
		if p.ObjectKey != "" {
			if err = client.deleteKey(ctx, c, p.ObjectKey); err != nil {
				break
			}
		}
	}
	if err == nil {
		err = client.deleteKey(ctx, c, b.ObjectKey)
	}
	message := ""
	if err != nil {
		message = "对象清理失败，将自动重试"
	}
	saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer stop()
	if saveErr := s.repo.FinishBlob(saveCtx, b, message); saveErr != nil {
		return saveErr
	}
	return err
}
