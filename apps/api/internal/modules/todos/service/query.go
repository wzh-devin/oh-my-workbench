package service

import (
	"context"
	"encoding/json"
	d "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	r "github.com/devin/oh-my-workbench/api/internal/modules/todos/repository"
	"strings"
	"time"
	"unicode/utf8"
)

// Configuration 初始化已有视图/优先级，读取接口仍按各自资源返回。
func (s *Service) Configuration(ctx context.Context, userID int64) error {
	return s.repo.Write(ctx, userID, func(repo *r.Repository) error { return s.ensureConfiguration(repo, userID) })
}
func (s *Service) Lists(ctx context.Context, userID int64) ([]d.ListView, error) {
	return s.repo.Lists(ctx, userID)
}
func (s *Service) Views(ctx context.Context, userID int64) ([]d.ViewInfo, error) {
	if err := s.Configuration(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.Views(ctx, userID)
}
func (s *Service) Priorities(ctx context.Context, userID int64) ([]d.PriorityInfo, error) {
	if err := s.Configuration(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.ReadPriorities(ctx, userID)
}
func (s *Service) Counts(ctx context.Context, userID int64) (map[string]int64, error) {
	return s.repo.Counts(ctx, userID, time.Now().In(time.FixedZone("CST", 8*3600)))
}

// Query 校验规则、视图和清单归属，再把参数化分页交给Repository。
func (s *Service) Query(ctx context.Context, userID int64, input d.QueryInput) (d.TaskPage, error) {
	if input.PageNum < 1 || input.PageNum > 1000000 || input.PageSize < 1 || input.PageSize > 200 || utf8.RuneCountInString(input.Search) > 200 {
		return d.TaskPage{}, d.ErrInvalid
	}
	if input.Sort == "" {
		input.Sort = "due"
	}
	if input.Sort != "due" && input.Sort != "priority" && input.Sort != "newest" {
		return d.TaskPage{}, d.ErrInvalid
	}
	today := time.Now().In(time.FixedZone("CST", 8*3600))
	rules := []string{}
	args := []any{}
	documents := []json.RawMessage{}
	if input.ViewID != "" && input.ListID == "" {
		id, e := d.ParseID(input.ViewID)
		if e != nil {
			return d.TaskPage{}, e
		}
		v, e := s.repo.FindView(userID, id)
		if e != nil {
			return d.TaskPage{}, e
		}
		documents = append(documents, v.FilterQuery)
		if v.SearchText != "" {
			rules = append(rules, "strpos("+r.TaskTextSQL+",lower(?))>0")
			args = append(args, v.SearchText)
		}
	}
	if input.ListID != "" && input.ListID != "list-inbox" {
		id, e := d.ParseID(input.ListID)
		if e != nil {
			return d.TaskPage{}, e
		}
		if _, e = s.repo.List(userID, id); e != nil {
			return d.TaskPage{}, e
		}
	}
	if len(input.FilterQuery) > 0 {
		documents = append(documents, input.FilterQuery)
	}
	for _, doc := range documents {
		ids, e := validateViewRule(doc)
		if e != nil {
			return d.TaskPage{}, e
		}
		owned, e := s.repo.OwnedLists(userID, ids)
		if e != nil {
			return d.TaskPage{}, e
		}
		if len(owned) != len(ids) {
			return d.TaskPage{}, d.ErrRule
		}
		p, a, e := r.RuleSQL(doc, today)
		if e != nil {
			return d.TaskPage{}, e
		}
		rules = append(rules, "("+p+")")
		args = append(args, a...)
	}
	predicate := "TRUE"
	if len(rules) > 0 {
		predicate = strings.Join(rules, " AND ")
	}
	return s.repo.TaskPage(ctx, userID, input, predicate, args)
}
func (s *Service) Task(ctx context.Context, userID, id int64) (d.TaskView, error) {
	t, steps, e := s.repo.Task(userID, id)
	return d.ToTaskView(t, steps), e
}
