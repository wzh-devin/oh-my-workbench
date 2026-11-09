package todos

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

// 导入不删除浏览器备份；同用户 legacy_id 查重后跳过，避免重试覆盖远端修改。
func (s *Service) Import(ctx context.Context, userID int64, input todoreq.ImportRequest) (todoresp.SnapshotResponse, error) {
	var snapshot todoresp.SnapshotResponse
	if len(input.Lists) > 1000 || len(input.Tasks) > 10000 {
		return snapshot, tododomain.ErrInvalid
	}
	err := s.repo.Todo.Write(ctx, userID, func(r *repository.Store) error {
		if err := s.ensureConfiguration(r, userID); err != nil {
			return err
		}
		listIDs := map[string]*int64{"list-inbox": nil}
		seen := map[string]bool{}
		for _, old := range input.Lists {
			if !tododomain.ValidText(old.ID, 1, 256) || seen[old.ID] {
				return tododomain.ErrInvalid
			}
			seen[old.ID] = true
			if old.ID == "list-inbox" {
				continue
			}
			name, err := tododomain.NormalizeName(old.Name)
			if err != nil {
				return err
			}
			if name == "收集箱" {
				return tododomain.ErrListName
			}
			list, found, err := r.TodoList.ListByLegacy(userID, old.ID)
			if err != nil {
				return err
			}
			if !found {
				if err := r.TodoList.NameAvailable(userID, name, 0); err != nil {
					return err
				}
				now := time.Now().UTC()
				legacy := old.ID
				list = repository.TodoList{TodoRecord: repository.TodoRecord{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, Name: name, LegacyID: &legacy}
				if err := r.TodoList.CreateList(&list); err != nil {
					return err
				}
			}
			id := list.ID
			listIDs[old.ID] = &id
		}
		seen = map[string]bool{}
		for _, old := range input.Tasks {
			if !tododomain.ValidText(old.ID, 1, 256) || seen[old.ID] {
				return tododomain.ErrInvalid
			}
			seen[old.ID] = true
			imported, err := r.Todo.TaskImported(userID, old.ID)
			if err != nil {
				return err
			}
			if imported {
				continue
			}
			listID, ok := listIDs[old.ListID]
			if !ok {
				return tododomain.ErrInvalid
			}
			if old.CreatedAt.IsZero() || old.CreatedAt.Year() < 1 || old.CreatedAt.Year() > 9999 {
				return tododomain.ErrInvalid
			}
			if old.CompletedAt != nil && (old.CompletedAt.IsZero() || old.CompletedAt.Year() < 1 || old.CompletedAt.Year() > 9999) {
				return tododomain.ErrInvalid
			}
			var listJSON []byte
			if listID == nil {
				listJSON = []byte("null")
			} else {
				listJSON, _ = json.Marshal(strconv.FormatInt(*listID, 10))
			}
			due, _ := json.Marshal(old.DueDate)
			planned, _ := json.Marshal(old.PlannedFor)
			source, _ := json.Marshal(old.Source)
			steps := append([]todoreq.StepRequest{}, old.Steps...)
			for i := range steps {
				steps[i].ID = ""
			}
			priority := old.Priority
			if priority == 0 {
				priority = 4
			}
			request := todoreq.TaskRequest{Title: &old.Title, Note: &old.Note, Done: &old.Done, Priority: &priority, ListID: listJSON, DueDate: due, PlannedFor: planned, Tags: &old.Tags, Steps: &steps, Source: source}
			existingSource := false
			if old.Source != nil {
				_, found, err := r.Todo.TaskBySource(userID, old.Source.Kind, old.Source.ID)
				if err != nil {
					return err
				}
				existingSource = found
			}
			task, err := s.saveTask(r, userID, 0, request)
			if err != nil {
				return err
			}
			var createdAt, completedAt *time.Time
			if !existingSource {
				createdAt = &old.CreatedAt
				if old.Done {
					completedAt = old.CompletedAt
				}
			}
			if err := r.Todo.RecordImport(userID, task.ID, old.ID, createdAt, completedAt); err != nil {
				return err
			}
		}
		var err error
		snapshot, err = r.Todo.ReadSnapshot(userID)
		return err
	})
	return snapshot, err
}
