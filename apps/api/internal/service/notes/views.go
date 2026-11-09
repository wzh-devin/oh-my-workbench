package notes

import (
	"context"
	"strconv"
	"strings"
	"unicode/utf8"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	noteresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/notes"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

func viewInfo(v repository.NoteView) noteresp.SavedViewResponse {
	return noteresp.SavedViewResponse{BuiltinKey: v.BuiltinKey, ID: strconv.FormatInt(v.ID, 10), Name: v.Name, Icon: v.Icon, Scope: v.Scope, FilterQuery: v.FilterQuery, Sort: v.Sort, Version: v.Version}
}

func (s *Service) Views(ctx context.Context, user int64) ([]noteresp.SavedViewResponse, error) {
	records, err := s.repo.NoteView.Views(ctx, user)
	out := []noteresp.SavedViewResponse{}
	for _, v := range records {
		out = append(out, viewInfo(v))
	}
	return out, err
}

func (s *Service) SaveView(ctx context.Context, user int64, input notereq.SaveViewRequest) (noteresp.SavedViewResponse, error) {
	input.Name = strings.TrimSpace(input.Name)
	if !utf8.ValidString(input.Name) || utf8.RuneCountInString(input.Name) < 1 || utf8.RuneCountInString(input.Name) > 100 {
		return noteresp.SavedViewResponse{}, notedomain.ErrInvalid
	}
	if input.ID != "" {
		if _, err := notedomain.ParseID(input.ID); err != nil || input.Version < 1 {
			return noteresp.SavedViewResponse{}, notedomain.ErrInvalid
		}
	}
	if !map[string]bool{"file-text": true, "star": true, "lock": true, "trash": true, "book": true, "code": true, "tag": true}[input.Icon] || input.Scope != "all" || !map[string]bool{"updated": true, "created": true, "title": true}[input.Sort] {
		return noteresp.SavedViewResponse{}, notedomain.ErrInvalid
	}
	if len(input.FilterQuery) == 0 {
		return noteresp.SavedViewResponse{}, notedomain.ErrInvalid
	}
	if _, _, err := repository.NotesRuleSQL(input.FilterQuery); err != nil {
		return noteresp.SavedViewResponse{}, err
	}
	out, err := s.repo.NoteView.SaveView(ctx, user, input)
	return viewInfo(out), err
}

func (s *Service) DeleteView(ctx context.Context, user int64, target notereq.TargetRequest) error {
	if !targetsValid([]notereq.TargetRequest{target}) {
		return notedomain.ErrInvalid
	}
	return s.repo.NoteView.DeleteView(ctx, user, target)
}
