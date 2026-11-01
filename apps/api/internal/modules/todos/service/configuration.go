package service

import (
	"context"
	"strings"
	"time"

	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	todorepo "github.com/devin/oh-my-workbench/api/internal/modules/todos/repository"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

func (s *Service) ensureConfiguration(r *todorepo.Repository, userID int64) error {
	history, err := r.HasViewHistory(userID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	if !history {
		for _, seed := range defaultViews {
			key := seed.key
			view := tododomain.View{Record: tododomain.Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, BuiltinKey: &key, Name: seed.name, Icon: seed.icon, FilterQuery: []byte(seed.rule), Sort: "due", Version: 1}
			if err := r.SaveView(&view); err != nil {
				return err
			}
		}
	}
	priorities, err := r.Priorities(userID)
	if err != nil {
		return err
	}
	existing := map[int]bool{}
	for _, p := range priorities {
		existing[p.Value] = true
	}
	for i, seed := range []struct{ name, color string }{{"P1 紧急", "red"}, {"P2 高", "amber"}, {"P3 普通", "blue"}, {"无优先级", "gray"}} {
		if existing[i+1] {
			continue
		}
		priority := tododomain.Priority{Record: tododomain.Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, Value: i + 1, Name: seed.name, Color: seed.color, Position: i, Version: 1}
		if err := r.SavePriority(&priority); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) SaveView(ctx context.Context, userID, id int64, input tododomain.ViewRequest) (tododomain.ViewInfo, error) {
	var result tododomain.ViewInfo
	name, err := tododomain.NormalizeName(input.Name)
	if err != nil {
		return result, err
	}
	if !viewIcons[input.Icon] || !tododomain.ValidText(input.SearchText, 0, 200) || (input.Sort != "due" && input.Sort != "priority" && input.Sort != "newest") {
		return result, tododomain.ErrInvalid
	}
	listIDs, err := validateViewRule(input.FilterQuery)
	if err != nil {
		return result, err
	}
	err = s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		if err := s.ensureConfiguration(r, userID); err != nil {
			return err
		}
		now := time.Now().UTC()
		view := tododomain.View{Record: tododomain.Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}}
		if id != 0 {
			var err error
			view, err = r.FindView(userID, id)
			if err != nil {
				return err
			}
			if input.Version != view.Version {
				return tododomain.ErrConflict
			}
		} else {
			count, err := r.ViewCount(userID)
			if err != nil {
				return err
			}
			if count >= 100 {
				return tododomain.ErrViewLimit
			}
		}
		if err := r.ViewNameAvailable(userID, id, name); err != nil {
			return err
		}
		owned, err := r.OwnedLists(userID, listIDs)
		if err != nil {
			return err
		}
		if len(owned) != len(listIDs) {
			return tododomain.ErrRule
		}
		view.Name = name
		view.Icon = input.Icon
		view.FilterQuery = input.FilterQuery
		view.SearchText = strings.TrimSpace(input.SearchText)
		view.Sort = input.Sort
		view.UpdatedAt = now
		view.Version++
		if err := r.SaveView(&view); err != nil {
			return err
		}
		result = tododomain.ToViewInfo(view)
		return nil
	})
	return result, err
}

func (s *Service) DeleteView(ctx context.Context, userID, id int64, version int) error {
	return s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		view, err := r.FindView(userID, id)
		if err != nil {
			return err
		}
		if view.Version != version {
			return tododomain.ErrConflict
		}
		count, err := r.ViewCount(userID)
		if err != nil {
			return err
		}
		if count <= 1 {
			return tododomain.ErrLastView
		}
		return r.DeleteView(userID, id, time.Now().UTC())
	})
}

func (s *Service) SavePriorities(ctx context.Context, userID int64, input tododomain.PrioritiesRequest) ([]tododomain.PriorityInfo, error) {
	result := []tododomain.PriorityInfo{}
	if len(input.Priorities) != 4 {
		return result, tododomain.ErrInvalid
	}
	seen := map[int]bool{}
	names := map[string]bool{}
	for i := range input.Priorities {
		p := &input.Priorities[i]
		p.Name = strings.TrimSpace(p.Name)
		color, validColor := tododomain.NormalizePriorityColor(p.Color)
		if p.Value < 1 || p.Value > 4 || seen[p.Value] || names[p.Name] || !tododomain.ValidText(p.Name, 1, 24) || !validColor || p.Version < 1 {
			return result, tododomain.ErrInvalid
		}
		p.Color = color
		seen[p.Value] = true
		names[p.Name] = true
	}
	err := s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		if err := s.ensureConfiguration(r, userID); err != nil {
			return err
		}
		priorities, err := r.Priorities(userID)
		if err != nil {
			return err
		}
		byValue := map[int]tododomain.Priority{}
		for _, p := range priorities {
			byValue[p.Value] = p
		}
		for position, p := range input.Priorities {
			saved, ok := byValue[p.Value]
			if !ok || saved.Version != p.Version {
				return tododomain.ErrConflict
			}
			saved.Name = p.Name
			saved.Color = p.Color
			saved.Position = position
			saved.Version++
			saved.UpdatedAt = time.Now().UTC()
			if err := r.SavePriority(&saved); err != nil {
				return err
			}
			result = append(result, tododomain.ToPriorityInfo(saved))
		}
		return nil
	})
	return result, err
}
