package assets

import (
	"context"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// Connections、Directories和Statistics保持独立读取职责。
func (s *Service) Connections(ctx context.Context, userID int64) ([]repository.AssetConnection, error) {
	return s.repo.AssetConnection.Connections(ctx, userID)
}

func (s *Service) Directories(ctx context.Context, userID int64) ([]repository.AssetEntry, error) {
	return s.repo.AssetEntry.Directories(ctx, userID)
}

func (s *Service) Statistics(ctx context.Context, userID int64) (assetdto.Statistics, error) {
	return s.repo.AssetEntry.Statistics(ctx, userID)
}

// DeleteViews validates the whole batch before entering its atomic write.
func (s *Service) DeleteViews(ctx context.Context, userID int64, items []assetreq.BatchItemRequest) error {
	if len(items) < 1 || len(items) > 100 {
		return assetdomain.ErrInvalid
	}
	seen := map[string]bool{}
	for _, item := range items {
		if _, e := assetdomain.ParseID(item.ID); e != nil || item.Version < 1 || seen[item.ID] {
			return assetdomain.ErrInvalid
		}
		seen[item.ID] = true
	}
	return s.repo.AssetView.DeleteViews(ctx, userID, items)
}
