package service

import (
	"context"
	d "github.com/devin/oh-my-workbench/api/internal/modules/workbench/domain"
	r "github.com/devin/oh-my-workbench/api/internal/modules/workbench/repository"
	"unicode/utf8"
)

type Service struct{ repo *r.Repository }

func NewService(repo *r.Repository) *Service { return &Service{repo} }
func (s *Service) Statistics(ctx context.Context, userID int64) (d.Statistics, error) {
	return s.repo.Statistics(ctx, userID)
}
func (s *Service) Issues(ctx context.Context, userID int64) (d.Issues, error) {
	return s.repo.Issues(ctx, userID)
}
func validPage(in d.PageInput) bool {
	return in.PageNum >= 1 && in.PageNum <= 1000000 && in.PageSize >= 1 && in.PageSize <= 100 && utf8.RuneCountInString(in.Search) <= 200
}
func (s *Service) Records(ctx context.Context, userID int64, in d.PageInput) (d.RecordPage, error) {
	if !validPage(in) || (in.Kind != "all" && in.Kind != "todo" && in.Kind != "mail" && in.Kind != "asset") {
		return d.RecordPage{}, d.ErrInvalid
	}
	return s.repo.Records(ctx, userID, in)
}
func (s *Service) Notifications(ctx context.Context, userID int64, in d.PageInput) (d.NotificationPage, error) {
	if !validPage(in) || len(in.ReadIDs) > 10000 || len(in.Kinds) > 3 {
		return d.NotificationPage{}, d.ErrInvalid
	}
	for _, id := range in.ReadIDs {
		if len(id) > 200 {
			return d.NotificationPage{}, d.ErrInvalid
		}
	}
	for _, kind := range in.Kinds {
		if kind != "todos" && kind != "mail" && kind != "connections" {
			return d.NotificationPage{}, d.ErrInvalid
		}
	}
	if in.ReadIDs == nil {
		in.ReadIDs = []string{}
	}
	if len(in.Kinds) == 0 {
		return d.NotificationPage{Records: []d.Notification{}}, nil
	}
	return s.repo.Notifications(ctx, userID, in)
}

func (s *Service) ReadAll(ctx context.Context, userID int64, in d.PageInput) error {
	if len(in.Kinds) > 3 {
		return d.ErrInvalid
	}
	for _, kind := range in.Kinds {
		if kind != "todos" && kind != "mail" && kind != "connections" {
			return d.ErrInvalid
		}
	}
	return s.repo.ReadAll(ctx, userID, in.Kinds)
}
