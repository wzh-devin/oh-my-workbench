package notes

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	noteresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/notes"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	authservice "github.com/devin/oh-my-workbench/api/internal/service/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Service struct {
	repo *repository.Store
	auth *authservice.Service
	keys *keyring
}

func NewService(ctx context.Context, repository *repository.Store, auth *authservice.Service) (*Service, error) {
	keys, err := prepareKeys(ctx, repository, nil)
	if err != nil {
		return nil, err
	}
	return &Service{repo: repository, auth: auth, keys: keys}, nil
}

func (s *Service) ready() error {
	if s.keys == nil {
		return notedomain.ErrUnavailable
	}
	return nil
}

func (s *Service) Ready() bool { return s.keys != nil }

func (s *Service) Notebooks(ctx context.Context, user int64) ([]noteresp.NotebookResponse, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	records, err := s.repo.NoteNotebook.Notebooks(ctx, user)
	out := []noteresp.NotebookResponse{}
	for _, book := range records {
		out = append(out, noteresp.NotebookResponse{ID: strconv.FormatInt(book.ID, 10), Name: book.Name, Version: book.Version})
	}
	return out, err
}

func (s *Service) SaveNotebook(ctx context.Context, user int64, target notereq.TargetRequest, name string) (noteresp.NotebookResponse, error) {
	if err := s.ready(); err != nil {
		return noteresp.NotebookResponse{}, err
	}
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 80 {
		return noteresp.NotebookResponse{}, notedomain.ErrInvalid
	}
	var id int64
	var err error
	if target.ID != "" {
		id, err = notedomain.ParseID(target.ID)
		if err != nil || target.Version < 1 {
			return noteresp.NotebookResponse{}, notedomain.ErrInvalid
		}
	}
	book, err := s.repo.NoteNotebook.SaveNotebook(ctx, user, id, target.Version, name)
	return noteresp.NotebookResponse{ID: strconv.FormatInt(book.ID, 10), Name: book.Name, Version: book.Version}, err
}

func targetsValid(targets []notereq.TargetRequest) bool {
	if len(targets) == 0 || len(targets) > 100 {
		return false
	}
	seen := map[string]bool{}
	for _, target := range targets {
		if _, err := notedomain.ParseID(target.ID); err != nil || target.Version < 1 || seen[target.ID] {
			return false
		}
		seen[target.ID] = true
	}
	return true
}

func (s *Service) DeleteNotebooks(ctx context.Context, user int64, targets []notereq.TargetRequest) error {
	if err := s.ready(); err != nil {
		return err
	}
	if !targetsValid(targets) {
		return notedomain.ErrInvalid
	}
	return s.repo.NoteNotebook.DeleteNotebooks(ctx, user, targets)
}

func (s *Service) Page(ctx context.Context, user int64, q notereq.NotePageRequest) (noteresp.NotePageResponse, error) {
	if err := s.ready(); err != nil {
		return noteresp.NotePageResponse{}, err
	}
	if q.PageNum < 1 || q.PageNum > 100000 || q.PageSize < 1 || q.PageSize > 100 || !utf8.ValidString(q.Search) || utf8.RuneCountInString(q.Search) > 200 {
		return noteresp.NotePageResponse{}, notedomain.ErrInvalid
	}
	if q.Scope != "all" && q.Scope != "favorite" && q.Scope != "locked" && q.Scope != "trash" {
		return noteresp.NotePageResponse{}, notedomain.ErrInvalid
	}
	if q.NotebookID != "" && q.NotebookID != "unfiled" {
		if _, err := notedomain.ParseID(q.NotebookID); err != nil {
			return noteresp.NotePageResponse{}, err
		}
	}
	if q.ViewID != "" {
		if _, err := notedomain.ParseID(q.ViewID); err != nil {
			return noteresp.NotePageResponse{}, err
		}
		view, err := s.repo.NoteView.FindView(ctx, user, q.ViewID)
		if err != nil {
			return noteresp.NotePageResponse{}, err
		}
		q.Scope = view.Scope
		q.SavedRule = view.FilterQuery
		q.Sort = view.Sort
	}
	if q.Sort != "" && q.Sort != "updated" && q.Sort != "created" && q.Sort != "title" {
		return noteresp.NotePageResponse{}, notedomain.ErrInvalid
	}
	return s.repo.Note.Page(ctx, user, q)
}

func (s *Service) access(ctx context.Context, user, id int64, session string) (repository.Note, error) {
	if err := s.ready(); err != nil {
		return repository.Note{}, err
	}
	note, err := s.repo.Note.Note(ctx, user, id)
	if err != nil {
		return note, err
	}
	if note.RequiresUnlock {
		ok, err := s.repo.NoteAccess.Unlocked(ctx, user, session)
		if err != nil {
			return note, err
		}
		if !ok {
			return note, notedomain.ErrLocked
		}
	}
	return note, nil
}

// Metadata determines the unlock flow without decrypting or exposing a note body.
func (s *Service) Metadata(ctx context.Context, user, id int64) (noteresp.NoteResponse, error) {
	if err := s.ready(); err != nil {
		return noteresp.NoteResponse{}, err
	}
	note, err := s.repo.Note.Metadata(ctx, user, id)
	return repository.NoteInfo(note), err
}

func (s *Service) Detail(ctx context.Context, user, id int64, session string) (noteresp.NoteResponse, error) {
	note, err := s.access(ctx, user, id, session)
	if err != nil {
		return noteresp.NoteResponse{}, err
	}
	markdown, err := s.keys.decrypt(user, id, note.KeyID, note.BodyCiphertext)
	out := repository.NoteInfo(note)
	if note.RequiresUnlock {
		until, e := s.repo.NoteAccess.UnlockExpiry(ctx, user, session)
		if e != nil {
			return noteresp.NoteResponse{}, e
		}
		out.UnlockedUntil = &until
	}
	if err == nil {
		out.Markdown = &markdown
	}
	return out, err
}

func validate(input *notereq.SaveNoteRequest) error {
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" {
		input.Title = "未命名笔记"
	}
	if !utf8.ValidString(input.Title) || utf8.RuneCountInString(input.Title) > 200 || !utf8.ValidString(input.Markdown) || len(input.Markdown) > notedomain.MaxBody || len(input.Tags) > 10 {
		return notedomain.ErrInvalid
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, tag := range input.Tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || !utf8.ValidString(tag) || utf8.RuneCountInString(tag) > 24 {
			return notedomain.ErrInvalid
		}
		if !seen[tag] {
			seen[tag] = true
			tags = append(tags, tag)
		}
	}
	input.Tags = tags
	return nil
}

func (s *Service) Save(ctx context.Context, user int64, session string, input notereq.SaveNoteRequest, force bool) (noteresp.NoteResponse, error) {
	if err := s.ready(); err != nil {
		return noteresp.NoteResponse{}, err
	}
	if err := validate(&input); err != nil {
		return noteresp.NoteResponse{}, err
	}
	var note repository.Note
	var err error
	if input.ID == "" {
		if len(input.RequestID) < 16 || len(input.RequestID) > 80 || strings.ContainsAny(input.RequestID, " \r\n\t") {
			return noteresp.NoteResponse{}, notedomain.ErrInvalid
		}
		existing, e := s.repo.Note.Request(ctx, user, input.RequestID)
		if e == nil {
			// Idempotent creation returns metadata only, even after a later edit or trash operation.
			return repository.NoteInfo(existing), nil
		}
		if !errors.Is(e, notedomain.ErrNotFound) {
			return noteresp.NoteResponse{}, e
		}
		note = repository.Note{NoteRecord: repository.NoteRecord{ID: idgen.Next(), UserID: user}, CreateRequestID: input.RequestID}
		input.Version = 0
	} else {
		id, e := notedomain.ParseID(input.ID)
		if e != nil || input.Version < 1 {
			return noteresp.NoteResponse{}, notedomain.ErrInvalid
		}
		note, err = s.access(ctx, user, id, session)
		if err != nil {
			return noteresp.NoteResponse{}, err
		}
		if note.DeletedAt != nil {
			return noteresp.NoteResponse{}, notedomain.ErrNotFound
		}
	}
	if input.RequiresUnlock && input.ID != "" {
		ok, e := s.repo.NoteAccess.Unlocked(ctx, user, session)
		if e != nil {
			return noteresp.NoteResponse{}, e
		}
		if !ok {
			return noteresp.NoteResponse{}, notedomain.ErrLocked
		}
	}
	note.NotebookID = nil
	if input.NotebookID != nil {
		id, e := notedomain.ParseID(*input.NotebookID)
		if e != nil {
			return noteresp.NoteResponse{}, e
		}
		note.NotebookID = &id
	}
	note.DiaryDate = nil
	if input.DiaryDate != nil {
		date, e := time.Parse(time.DateOnly, *input.DiaryDate)
		if e != nil {
			return noteresp.NoteResponse{}, notedomain.ErrInvalid
		}
		note.DiaryDate = &date
	}
	note.Title = input.Title
	note.Tags = input.Tags
	note.RequiresUnlock = input.RequiresUnlock
	note.Favorite = input.Favorite
	note.BodyCiphertext, note.KeyID, err = s.keys.encrypt(user, note.ID, input.Markdown)
	if err != nil {
		return noteresp.NoteResponse{}, err
	}
	saved, err := s.repo.Note.Save(ctx, note, input.Version, force)
	return repository.NoteInfo(saved), err
}

func (s *Service) Batch(ctx context.Context, user int64, session string, targets []notereq.TargetRequest, action string) error {
	if err := s.ready(); err != nil {
		return err
	}
	if !targetsValid(targets) {
		return notedomain.ErrInvalid
	}
	ok, err := s.repo.NoteAccess.Unlocked(ctx, user, session)
	if err != nil {
		return err
	}
	return s.repo.Note.Batch(ctx, user, targets, action, ok)
}

func (s *Service) Revisions(ctx context.Context, user, id int64, session string) ([]noteresp.RevisionResponse, error) {
	if _, err := s.access(ctx, user, id, session); err != nil {
		return nil, err
	}
	records, err := s.repo.NoteRevision.Revisions(ctx, user, id)
	out := []noteresp.RevisionResponse{}
	for _, record := range records {
		out = append(out, noteresp.RevisionResponse{ID: strconv.FormatInt(record.ID, 10), NoteVersion: record.NoteVersion, CreatedAt: record.CreatedAt})
	}
	return out, err
}

func (s *Service) Revision(ctx context.Context, user, noteID, id int64, session string) (noteresp.RevisionResponse, error) {
	if _, err := s.access(ctx, user, noteID, session); err != nil {
		return noteresp.RevisionResponse{}, err
	}
	record, err := s.repo.NoteRevision.Revision(ctx, user, noteID, id)
	if err != nil {
		return noteresp.RevisionResponse{}, err
	}
	markdown, err := s.keys.decrypt(user, noteID, record.KeyID, record.BodyCiphertext)
	out := noteresp.RevisionResponse{ID: strconv.FormatInt(record.ID, 10), NoteVersion: record.NoteVersion, CreatedAt: record.CreatedAt}
	if err == nil {
		out.Markdown = &markdown
	}
	return out, err
}

func (s *Service) RestoreRevision(ctx context.Context, user, noteID, id int64, session string, version int) (noteresp.NoteResponse, error) {
	current, err := s.Detail(ctx, user, noteID, session)
	if err != nil {
		return noteresp.NoteResponse{}, err
	}
	revision, err := s.Revision(ctx, user, noteID, id, session)
	if err != nil {
		return noteresp.NoteResponse{}, err
	}
	return s.Save(ctx, user, session, notereq.SaveNoteRequest{ID: current.ID, Version: version, NotebookID: current.NotebookID, Title: current.Title, Tags: current.Tags, Markdown: *revision.Markdown, RequiresUnlock: current.RequiresUnlock, Favorite: current.Favorite, DiaryDate: current.DiaryDate}, true)
}

func (s *Service) Unlock(ctx context.Context, user int64, session, password string) (time.Time, error) {
	if err := s.ready(); err != nil {
		return time.Time{}, err
	}
	if err := s.auth.VerifyPassword(ctx, user, password); err != nil {
		return time.Time{}, err
	}
	if err := s.repo.NoteAccess.Unlock(ctx, user, session); err != nil {
		return time.Time{}, err
	}
	return time.Now().UTC().Add(5 * time.Minute), nil
}

func (s *Service) Lock(ctx context.Context, user int64, session string) error {
	return s.repo.NoteAccess.Lock(ctx, user, session)
}
