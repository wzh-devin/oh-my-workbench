package service

import (
	"context"
	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	repo "github.com/devin/oh-my-workbench/api/internal/modules/notes/repository"
	"strconv"
	"strings"
	"unicode/utf8"
)

func viewInfo(v d.SavedView) d.SavedViewInfo {
	return d.SavedViewInfo{BuiltinKey: v.BuiltinKey, ID: strconv.FormatInt(v.ID, 10), Name: v.Name, Icon: v.Icon, Scope: v.Scope, FilterQuery: v.FilterQuery, Sort: v.Sort, Version: v.Version}
}
func (s *Service) Views(ctx context.Context, user int64) ([]d.SavedViewInfo, error) {
	records, err := s.repo.Views(ctx, user)
	out := []d.SavedViewInfo{}
	for _, v := range records {
		out = append(out, viewInfo(v))
	}
	return out, err
}
func (s *Service) SaveView(ctx context.Context, user int64, input d.ViewInput) (d.SavedViewInfo, error) {
	input.Name = strings.TrimSpace(input.Name)
	if !utf8.ValidString(input.Name) || utf8.RuneCountInString(input.Name) < 1 || utf8.RuneCountInString(input.Name) > 100 {
		return d.SavedViewInfo{}, d.ErrInvalid
	}
	if input.ID != "" {
		if _, err := d.ParseID(input.ID); err != nil || input.Version < 1 {
			return d.SavedViewInfo{}, d.ErrInvalid
		}
	}
	if !map[string]bool{"file-text": true, "star": true, "lock": true, "trash": true, "book": true, "code": true, "tag": true}[input.Icon] || input.Scope != "all" || !map[string]bool{"updated": true, "created": true, "title": true}[input.Sort] {
		return d.SavedViewInfo{}, d.ErrInvalid
	}
	if len(input.FilterQuery) == 0 {
		return d.SavedViewInfo{}, d.ErrInvalid
	}
	if _, _, err := repo.RuleSQL(input.FilterQuery); err != nil {
		return d.SavedViewInfo{}, err
	}
	out, err := s.repo.SaveView(ctx, user, input)
	return viewInfo(out), err
}
func (s *Service) DeleteView(ctx context.Context, user int64, target d.Target) error {
	if !targetsValid([]d.Target{target}) {
		return d.ErrInvalid
	}
	return s.repo.DeleteView(ctx, user, target)
}
