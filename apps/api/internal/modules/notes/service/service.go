// Package service enforces note ownership, unlock gates and authenticated encryption.
package service

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	authservice "github.com/devin/oh-my-workbench/api/internal/modules/auth/service"
	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	repo "github.com/devin/oh-my-workbench/api/internal/modules/notes/repository"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Service struct {
	repo *repo.Repository
	auth *authservice.Service
	keys *keyring
}

func NewService(repository *repo.Repository, auth *authservice.Service, path string) *Service {
	keys, _ := loadKeyring(path)
	return &Service{repo: repository, auth: auth, keys: keys}
}
func (s *Service) ready() error {
	if s.keys == nil {
		return d.ErrUnavailable
	}
	return nil
}

func (s *Service) Ready() bool { return s.keys != nil }
func (s *Service) Notebooks(ctx context.Context, user int64) ([]d.NotebookView, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	records, err := s.repo.Notebooks(ctx, user)
	out := []d.NotebookView{}
	for _, book := range records {
		out = append(out, d.NotebookView{ID: strconv.FormatInt(book.ID, 10), Name: book.Name, Version: book.Version})
	}
	return out, err
}
func (s *Service) SaveNotebook(ctx context.Context, user int64, target d.Target, name string) (d.NotebookView, error) {
	if err := s.ready(); err != nil {
		return d.NotebookView{}, err
	}
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 80 {
		return d.NotebookView{}, d.ErrInvalid
	}
	var id int64
	var err error
	if target.ID != "" {
		id, err = d.ParseID(target.ID)
		if err != nil || target.Version < 1 {
			return d.NotebookView{}, d.ErrInvalid
		}
	}
	book, err := s.repo.SaveNotebook(ctx, user, id, target.Version, name)
	return d.NotebookView{ID: strconv.FormatInt(book.ID, 10), Name: book.Name, Version: book.Version}, err
}
func targetsValid(targets []d.Target) bool {
	if len(targets) == 0 || len(targets) > 100 {
		return false
	}
	seen := map[string]bool{}
	for _, target := range targets {
		if _, err := d.ParseID(target.ID); err != nil || target.Version < 1 || seen[target.ID] {
			return false
		}
		seen[target.ID] = true
	}
	return true
}
func (s *Service) DeleteNotebooks(ctx context.Context, user int64, targets []d.Target) error {
	if err := s.ready(); err != nil {
		return err
	}
	if !targetsValid(targets) {
		return d.ErrInvalid
	}
	return s.repo.DeleteNotebooks(ctx, user, targets)
}
func (s *Service) Page(ctx context.Context, user int64, q d.Query) (d.Page, error) {
	if err := s.ready(); err != nil {
		return d.Page{}, err
	}
	if q.PageNum < 1 || q.PageNum > 100000 || q.PageSize < 1 || q.PageSize > 100 || !utf8.ValidString(q.Search) || utf8.RuneCountInString(q.Search) > 200 {
		return d.Page{}, d.ErrInvalid
	}
	if q.Scope != "all" && q.Scope != "favorite" && q.Scope != "locked" && q.Scope != "trash" {
		return d.Page{}, d.ErrInvalid
	}
	if q.NotebookID != "" && q.NotebookID != "unfiled" {
		if _, err := d.ParseID(q.NotebookID); err != nil {
			return d.Page{}, err
		}
	}
	if q.ViewID != "" {
		if _, err := d.ParseID(q.ViewID); err != nil {
			return d.Page{}, err
		}
		view, err := s.repo.FindView(ctx, user, q.ViewID)
		if err != nil {
			return d.Page{}, err
		}
		q.Scope = view.Scope
		q.SavedRule = view.FilterQuery
		q.Sort = view.Sort
	}
	if q.Sort != "" && q.Sort != "updated" && q.Sort != "created" && q.Sort != "title" {
		return d.Page{}, d.ErrInvalid
	}
	return s.repo.Page(ctx, user, q)
}
func (s *Service) access(ctx context.Context, user, id int64, session string) (d.Note, error) {
	if err := s.ready(); err != nil {
		return d.Note{}, err
	}
	note, err := s.repo.Note(ctx, user, id)
	if err != nil {
		return note, err
	}
	if note.RequiresUnlock {
		ok, err := s.repo.Unlocked(ctx, user, session)
		if err != nil {
			return note, err
		}
		if !ok {
			return note, d.ErrLocked
		}
	}
	return note, nil
}

// Metadata determines the unlock flow without decrypting or exposing a note body.
func (s *Service) Metadata(ctx context.Context, user, id int64) (d.NoteView, error) {
	if err := s.ready(); err != nil {
		return d.NoteView{}, err
	}
	note, err := s.repo.Metadata(ctx, user, id)
	return d.View(note), err
}
func (s *Service) Detail(ctx context.Context, user, id int64, session string) (d.NoteView, error) {
	note, err := s.access(ctx, user, id, session)
	if err != nil {
		return d.NoteView{}, err
	}
	markdown, err := s.keys.decrypt(user, id, note.KeyID, note.BodyCiphertext)
	out := d.View(note)
	if note.RequiresUnlock {
		until, e := s.repo.UnlockExpiry(ctx, user, session)
		if e != nil {
			return d.NoteView{}, e
		}
		out.UnlockedUntil = &until
	}
	if err == nil {
		out.Markdown = &markdown
	}
	return out, err
}
func validate(input *d.SaveInput) error {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		input.Title = "未命名笔记"
	}
	if !utf8.ValidString(input.Title) || utf8.RuneCountInString(input.Title) > 200 || !utf8.ValidString(input.Markdown) || len(input.Markdown) > d.MaxBody || len(input.Tags) > 10 {
		return d.ErrInvalid
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, tag := range input.Tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || !utf8.ValidString(tag) || utf8.RuneCountInString(tag) > 24 {
			return d.ErrInvalid
		}
		if !seen[tag] {
			seen[tag] = true
			tags = append(tags, tag)
		}
	}
	input.Tags = tags
	return nil
}
func (s *Service) Save(ctx context.Context, user int64, session string, input d.SaveInput, force bool) (d.NoteView, error) {
	if err := s.ready(); err != nil {
		return d.NoteView{}, err
	}
	if err := validate(&input); err != nil {
		return d.NoteView{}, err
	}
	var note d.Note
	var err error
	if input.ID == "" {
		if len(input.RequestID) < 16 || len(input.RequestID) > 80 || strings.ContainsAny(input.RequestID, " \r\n\t") {
			return d.NoteView{}, d.ErrInvalid
		}
		existing, e := s.repo.Request(ctx, user, input.RequestID)
		if e == nil {
			// Idempotent creation returns metadata only, even after a later edit or trash operation.
			return d.View(existing), nil
		}
		if !errors.Is(e, d.ErrNotFound) {
			return d.NoteView{}, e
		}
		note = d.Note{Record: d.Record{ID: idgen.Next(), UserID: user}, CreateRequestID: input.RequestID}
		input.Version = 0
	} else {
		id, e := d.ParseID(input.ID)
		if e != nil || input.Version < 1 {
			return d.NoteView{}, d.ErrInvalid
		}
		note, err = s.access(ctx, user, id, session)
		if err != nil {
			return d.NoteView{}, err
		}
		if note.DeletedAt != nil {
			return d.NoteView{}, d.ErrNotFound
		}
	}
	if input.RequiresUnlock && input.ID != "" {
		ok, e := s.repo.Unlocked(ctx, user, session)
		if e != nil {
			return d.NoteView{}, e
		}
		if !ok {
			return d.NoteView{}, d.ErrLocked
		}
	}
	note.NotebookID = nil
	if input.NotebookID != nil {
		id, e := d.ParseID(*input.NotebookID)
		if e != nil {
			return d.NoteView{}, e
		}
		note.NotebookID = &id
	}
	note.DiaryDate = nil
	if input.DiaryDate != nil {
		date, e := time.Parse(time.DateOnly, *input.DiaryDate)
		if e != nil {
			return d.NoteView{}, d.ErrInvalid
		}
		note.DiaryDate = &date
	}
	note.Title = input.Title
	note.Tags = input.Tags
	note.RequiresUnlock = input.RequiresUnlock
	note.Favorite = input.Favorite
	note.BodyCiphertext, note.KeyID, err = s.keys.encrypt(user, note.ID, input.Markdown)
	if err != nil {
		return d.NoteView{}, err
	}
	saved, err := s.repo.Save(ctx, note, input.Version, force)
	return d.View(saved), err
}
func (s *Service) Batch(ctx context.Context, user int64, session string, targets []d.Target, action string) error {
	if err := s.ready(); err != nil {
		return err
	}
	if !targetsValid(targets) {
		return d.ErrInvalid
	}
	ok, err := s.repo.Unlocked(ctx, user, session)
	if err != nil {
		return err
	}
	return s.repo.Batch(ctx, user, targets, action, ok)
}
func (s *Service) Revisions(ctx context.Context, user, id int64, session string) ([]d.RevisionView, error) {
	if _, err := s.access(ctx, user, id, session); err != nil {
		return nil, err
	}
	records, err := s.repo.Revisions(ctx, user, id)
	out := []d.RevisionView{}
	for _, record := range records {
		out = append(out, d.RevisionView{ID: strconv.FormatInt(record.ID, 10), NoteVersion: record.NoteVersion, CreatedAt: record.CreatedAt})
	}
	return out, err
}
func (s *Service) Revision(ctx context.Context, user, noteID, id int64, session string) (d.RevisionView, error) {
	if _, err := s.access(ctx, user, noteID, session); err != nil {
		return d.RevisionView{}, err
	}
	record, err := s.repo.Revision(ctx, user, noteID, id)
	if err != nil {
		return d.RevisionView{}, err
	}
	markdown, err := s.keys.decrypt(user, noteID, record.KeyID, record.BodyCiphertext)
	out := d.RevisionView{ID: strconv.FormatInt(record.ID, 10), NoteVersion: record.NoteVersion, CreatedAt: record.CreatedAt}
	if err == nil {
		out.Markdown = &markdown
	}
	return out, err
}
func (s *Service) RestoreRevision(ctx context.Context, user, noteID, id int64, session string, version int) (d.NoteView, error) {
	current, err := s.Detail(ctx, user, noteID, session)
	if err != nil {
		return d.NoteView{}, err
	}
	revision, err := s.Revision(ctx, user, noteID, id, session)
	if err != nil {
		return d.NoteView{}, err
	}
	return s.Save(ctx, user, session, d.SaveInput{ID: current.ID, Version: version, NotebookID: current.NotebookID, Title: current.Title, Tags: current.Tags, Markdown: *revision.Markdown, RequiresUnlock: current.RequiresUnlock, Favorite: current.Favorite, DiaryDate: current.DiaryDate}, true)
}
func (s *Service) Unlock(ctx context.Context, user int64, session, password string) (time.Time, error) {
	if err := s.ready(); err != nil {
		return time.Time{}, err
	}
	if err := s.auth.VerifyPassword(ctx, user, password); err != nil {
		return time.Time{}, err
	}
	if err := s.repo.Unlock(ctx, user, session); err != nil {
		return time.Time{}, err
	}
	return time.Now().UTC().Add(5 * time.Minute), nil
}
func (s *Service) Lock(ctx context.Context, user int64, session string) error {
	return s.repo.Lock(ctx, user, session)
}
