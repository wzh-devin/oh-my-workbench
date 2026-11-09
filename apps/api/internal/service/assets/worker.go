package assets

import (
	"context"
	"errors"
	"sync"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// 上传恢复、对象清理和预览各自运行，慢转换不会阻塞上传与清理。
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
	if err != nil && !errors.Is(err, assetdomain.ErrConflict) && !errors.Is(err, context.Canceled) {
		logging.Error(context.Background(), "assets.worker_failed", err, "task", kind)
	}
}

func (s *Service) uploadWork(ctx context.Context) {
	uploads, err := s.repo.AssetUpload.PendingUploads(ctx)
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
	blobs, err := s.repo.AssetBlob.CleanupBlobs(ctx)
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
	if s.converterURL == "" {
		return
	}
	previews, err := s.repo.AssetPreview.PendingPreviews(ctx)
	if err != nil {
		workerError("读取预览", err)
		return
	}
	available := map[int64]bool{}
	for _, p := range previews {
		healthy, checked := available[p.UserID]
		if !checked {
			healthy = s.rendererAvailable(ctx, p.UserID, "/health")
			available[p.UserID] = healthy
		}
		if !healthy {
			continue
		}
		workerError("预览", s.convertPreview(ctx, p))
		if ctx.Err() != nil {
			return
		}
	}
}

func (s *Service) thumbnailBackfill(ctx context.Context) {
	entries, err := s.repo.AssetEntry.ThumbnailBackfill(ctx, s.thumbnailCursor)
	if err != nil {
		workerError("补齐缩略图", err)
		return
	}
	if len(entries) == 0 {
		s.thumbnailCursor = 0
		return
	}
	byUser := map[int64][]repository.AssetEntry{}
	for _, e := range entries {
		byUser[e.UserID] = append(byUser[e.UserID], e)
	}
	for userID, page := range byUser {
		if err := s.repo.AssetPreview.QueueThumbnails(ctx, userID, page, false); err != nil {
			workerError("补齐缩略图", err)
			return
		}
	}
	s.thumbnailCursor = entries[len(entries)-1].ID
}

func (s *Service) cleanupBlob(ctx context.Context, blob repository.AssetBlob) error {
	b, err := s.repo.AssetBlob.ClaimBlob(ctx, blob)
	if err != nil {
		return err
	}
	c, err := s.repo.AssetConnection.Connection(ctx, b.UserID, b.ConnectionID)
	if err != nil {
		return err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		return err
	}
	previews, err := s.repo.AssetBlob.BlobPreviews(ctx, b)
	if err != nil {
		return err
	}
	for _, p := range previews {
		if p.LeaseUntil != nil && p.LeaseUntil.After(time.Now()) {
			err = assetdomain.ErrConflict
			break
		}
		if p.ObjectKey != "" {
			if err = storageError(client.DeleteKey(ctx, c.Bucket, p.ObjectKey)); err != nil {
				break
			}
		}
	}
	if err == nil {
		err = storageError(client.DeleteKey(ctx, c.Bucket, b.ObjectKey))
	}
	message := ""
	if err != nil {
		message = "对象清理失败，将自动重试"
	}
	saveCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer stop()
	if saveErr := s.repo.AssetBlob.FinishBlob(saveCtx, b, message); saveErr != nil {
		return saveErr
	}
	return err
}
