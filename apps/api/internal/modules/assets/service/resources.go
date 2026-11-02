package service

import (
	"context"
	d "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// Connections、Directories和Statistics保持独立读取职责。
func (s *Service) Connections(ctx context.Context, userID int64) ([]d.Connection, error) {
	return s.repo.Connections(ctx, userID)
}
func (s *Service) Directories(ctx context.Context, userID int64) ([]d.Entry, error) {
	return s.repo.Directories(ctx, userID)
}
func (s *Service) Statistics(ctx context.Context, userID int64) (d.Statistics, error) {
	return s.repo.Statistics(ctx, userID)
}

// DeleteViews validates the whole batch before entering its atomic write.
func (s *Service) DeleteViews(ctx context.Context, userID int64, items []d.BatchItem) error {
	if len(items) < 1 || len(items) > 100 {
		return d.ErrInvalid
	}
	seen := map[string]bool{}
	for _, item := range items {
		if _, e := d.ParseID(item.ID); e != nil || item.Version < 1 || seen[item.ID] {
			return d.ErrInvalid
		}
		seen[item.ID] = true
	}
	return s.repo.DeleteViews(ctx, userID, items)
}
