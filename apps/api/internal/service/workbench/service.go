package workbench

import (
	"context"
	"unicode/utf8"

	workbenchreq "github.com/devin/oh-my-workbench/api/internal/domain/req/workbench"
	workbenchresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/workbench"
	workbenchdomain "github.com/devin/oh-my-workbench/api/internal/domain/workbench"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

type Service struct{ repo *repository.Store }

func NewService(repo *repository.Store) *Service { return &Service{repo} }

func (s *Service) Statistics(ctx context.Context, userID int64) (workbenchresp.StatisticsResponse, error) {
	return s.repo.Workbench.Statistics(ctx, userID)
}

func (s *Service) Issues(ctx context.Context, userID int64) (workbenchresp.IssuesResponse, error) {
	return s.repo.Workbench.Issues(ctx, userID)
}

func validPage(in workbenchreq.RecordPageRequest) bool {
	return in.PageNum >= 1 && in.PageNum <= 1000000 && in.PageSize >= 1 && in.PageSize <= 100 && utf8.RuneCountInString(in.Search) <= 200
}

func (s *Service) Records(ctx context.Context, userID int64, in workbenchreq.RecordPageRequest) (workbenchresp.RecordPageResponse, error) {
	if !validPage(in) || (in.Kind != "all" && in.Kind != "todo" && in.Kind != "mail" && in.Kind != "asset") {
		return workbenchresp.RecordPageResponse{}, workbenchdomain.ErrInvalid
	}
	return s.repo.Workbench.Records(ctx, userID, in)
}

func (s *Service) Notifications(ctx context.Context, userID int64, in workbenchreq.RecordPageRequest) (workbenchresp.NotificationPageResponse, error) {
	if !validPage(in) || len(in.ReadIDs) > 10000 || len(in.Kinds) > 3 {
		return workbenchresp.NotificationPageResponse{}, workbenchdomain.ErrInvalid
	}
	for _, id := range in.ReadIDs {
		if len(id) > 200 {
			return workbenchresp.NotificationPageResponse{}, workbenchdomain.ErrInvalid
		}
	}
	for _, kind := range in.Kinds {
		if kind != "todos" && kind != "mail" && kind != "connections" {
			return workbenchresp.NotificationPageResponse{}, workbenchdomain.ErrInvalid
		}
	}
	if in.ReadIDs == nil {
		in.ReadIDs = []string{}
	}
	if len(in.Kinds) == 0 {
		return workbenchresp.NotificationPageResponse{Records: []workbenchresp.NotificationResponse{}}, nil
	}
	return s.repo.Workbench.Notifications(ctx, userID, in)
}

func (s *Service) ReadAll(ctx context.Context, userID int64, in workbenchreq.RecordPageRequest) error {
	if len(in.Kinds) > 3 {
		return workbenchdomain.ErrInvalid
	}
	for _, kind := range in.Kinds {
		if kind != "todos" && kind != "mail" && kind != "connections" {
			return workbenchdomain.ErrInvalid
		}
	}
	return s.repo.Workbench.ReadAll(ctx, userID, in.Kinds)
}
