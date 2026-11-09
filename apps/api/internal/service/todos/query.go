package todos

import (
	"context"
	"encoding/json"
	"strings"
	"time"
	"unicode/utf8"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// Configuration 初始化已有视图/优先级，读取接口仍按各自资源返回。
func (s *Service) Configuration(ctx context.Context, userID int64) error {
	return s.repo.Todo.Write(ctx, userID, func(repo *repository.Store) error { return s.ensureConfiguration(repo, userID) })
}

func (s *Service) Lists(ctx context.Context, userID int64) ([]todoresp.ListResponse, error) {
	return s.repo.TodoList.Lists(ctx, userID)
}

func (s *Service) Views(ctx context.Context, userID int64) ([]todoresp.ViewResponse, error) {
	if err := s.Configuration(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.TodoView.Views(ctx, userID)
}

func (s *Service) Priorities(ctx context.Context, userID int64) ([]todoresp.PriorityResponse, error) {
	if err := s.Configuration(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.TodoPriority.ReadPriorities(ctx, userID)
}

func (s *Service) Counts(ctx context.Context, userID int64) (map[string]int64, error) {
	return s.repo.Todo.Counts(ctx, userID, time.Now().In(time.FixedZone("CST", 8*3600)))
}

// Query 校验规则、视图和清单归属，再把参数化分页交给Repository。
func (s *Service) Query(ctx context.Context, userID int64, input todoreq.TaskPageRequest) (todoresp.TaskPageResponse, error) {
	if input.PageNum < 1 || input.PageNum > 1000000 || input.PageSize < 1 || input.PageSize > 200 || utf8.RuneCountInString(input.Search) > 200 {
		return todoresp.TaskPageResponse{}, tododomain.ErrInvalid
	}
	if input.Sort == "" {
		input.Sort = "due"
	}
	if input.Sort != "due" && input.Sort != "priority" && input.Sort != "newest" {
		return todoresp.TaskPageResponse{}, tododomain.ErrInvalid
	}
	today := time.Now().In(time.FixedZone("CST", 8*3600))
	rules := []string{}
	args := []any{}
	documents := []json.RawMessage{}
	if input.ViewID != "" && input.ListID == "" {
		id, e := tododomain.ParseID(input.ViewID)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		v, e := s.repo.TodoView.FindView(userID, id)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		documents = append(documents, v.FilterQuery)
		if v.SearchText != "" {
			rules = append(rules, "strpos("+repository.TodosTaskTextSQL+",lower(?))>0")
			args = append(args, v.SearchText)
		}
	}
	if input.ListID != "" && input.ListID != "list-inbox" {
		id, e := tododomain.ParseID(input.ListID)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		if _, e = s.repo.TodoList.List(userID, id); e != nil {
			return todoresp.TaskPageResponse{}, e
		}
	}
	if len(input.FilterQuery) > 0 {
		documents = append(documents, input.FilterQuery)
	}
	for _, doc := range documents {
		ids, e := validateViewRule(doc)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		owned, e := s.repo.TodoList.OwnedLists(userID, ids)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		if len(owned) != len(ids) {
			return todoresp.TaskPageResponse{}, tododomain.ErrRule
		}
		p, a, e := repository.TodosRuleSQL(doc, today)
		if e != nil {
			return todoresp.TaskPageResponse{}, e
		}
		rules = append(rules, "("+p+")")
		args = append(args, a...)
	}
	predicate := "TRUE"
	if len(rules) > 0 {
		predicate = strings.Join(rules, " AND ")
	}
	return s.repo.Todo.TaskPage(ctx, userID, input, predicate, args)
}

func (s *Service) Task(ctx context.Context, userID, id int64) (todoresp.TaskResponse, error) {
	t, steps, e := s.repo.Todo.Task(userID, id)
	return repository.TodoInfo(t, steps), e
}
