package todos

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Service struct{ repo *Repository }

func NewService(repo *Repository) *Service { return &Service{repo} }
func (s *Service) Snapshot(ctx context.Context, userID int64) (Snapshot, error) {
	snapshot, err := s.repo.Snapshot(ctx, userID)
	if err != nil {
		return snapshot, err
	}
	if len(snapshot.Views) > 0 && len(snapshot.Priorities) == 4 {
		return snapshot, nil
	}
	if err := s.repo.Write(ctx, userID, func(r *Repository) error { return s.ensureConfiguration(r, userID) }); err != nil {
		return Snapshot{}, err
	}
	return s.repo.Snapshot(ctx, userID)
}

func (s *Service) SaveList(ctx context.Context, userID, id int64, input ListRequest) (ListView, error) {
	var result ListView
	name, err := normalizeName(input.Name)
	if err == nil && name == "收集箱" {
		err = ErrListName
	}
	if err != nil {
		return result, err
	}
	err = s.repo.Write(ctx, userID, func(r *Repository) error {
		now := time.Now().UTC()
		list := List{Record: Record{ID: id, UserID: userID, CreatedAt: now, UpdatedAt: now}}
		if id != 0 {
			var err error
			list, err = r.list(userID, id)
			if err != nil {
				return err
			}
		} else {
			list.ID = idgen.Next()
		}
		if err := r.nameAvailable(userID, name, id); err != nil {
			return err
		}
		list.Name = name
		list.UpdatedAt = now
		if err := r.saveList(&list); err != nil {
			return err
		}
		result = listView(list)
		return nil
	})
	return result, err
}

func (s *Service) DeleteList(ctx context.Context, userID, id int64) (DeleteListResult, error) {
	result := DeleteListResult{ID: id, Tasks: []TaskView{}}
	err := s.repo.Write(ctx, userID, func(r *Repository) error {
		if _, err := r.list(userID, id); err != nil {
			return err
		}
		moved, err := r.moveTasksToInbox(userID, id, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := r.deleteList(userID, id); err != nil {
			return err
		}
		result.Tasks = moved
		return nil
	})
	return result, err
}

// PATCH 先合并当前版本再完整校验，状态与步骤在同一个用户事务中保存。
func (s *Service) saveTask(r *Repository, userID, id int64, input TaskRequest) (TaskView, error) {
	now := time.Now().UTC()
	task := Task{Record: Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, Priority: 4, Tags: []string{}}
	steps := []Step{}
	if id != 0 {
		var err error
		task, steps, err = r.task(userID, id)
		if err != nil {
			return TaskView{}, err
		}
		if input.Version != task.Version {
			return TaskView{}, ErrConflict
		}
	}
	if input.Title != nil {
		task.Title = strings.TrimSpace(*input.Title)
	}
	if input.Note != nil {
		task.Note = *input.Note
	}
	if input.Priority != nil {
		task.Priority = *input.Priority
	}
	if input.Done != nil {
		task.Done = *input.Done
	}
	if !validText(task.Title, 1, 200) || !validText(task.Note, 0, 2000) || task.Priority < 1 || task.Priority > 4 {
		return TaskView{}, ErrInvalid
	}
	if len(input.ListID) > 0 {
		task.ListID = nil
		if string(input.ListID) != "null" {
			var text string
			if json.Unmarshal(input.ListID, &text) != nil {
				return TaskView{}, ErrInvalid
			}
			listID, err := parseID(text)
			if err != nil {
				return TaskView{}, err
			}
			task.ListID = &listID
		}
	}
	if task.ListID != nil {
		if _, err := r.list(userID, *task.ListID); err != nil {
			return TaskView{}, err
		}
	}
	var err error
	task.DueDate, err = parseDate(input.DueDate, task.DueDate)
	if err != nil {
		return TaskView{}, err
	}
	task.PlannedFor, err = parseDate(input.PlannedFor, task.PlannedFor)
	if err != nil {
		return TaskView{}, err
	}
	if input.Tags != nil {
		if len(*input.Tags) > 10 {
			return TaskView{}, ErrInvalid
		}
		task.Tags = []string{}
		seen := map[string]bool{}
		for _, tag := range *input.Tags {
			tag = strings.TrimSpace(tag)
			if !validText(tag, 1, 24) {
				return TaskView{}, ErrInvalid
			}
			if !seen[tag] {
				task.Tags = append(task.Tags, tag)
				seen[tag] = true
			}
		}
	}
	if len(input.Source) > 0 {
		// 来源只在创建时确定；引用本身不作为读取邮件或其他用户数据的授权凭据。
		var source *Source
		if json.Unmarshal(input.Source, &source) != nil {
			return TaskView{}, ErrInvalid
		}
		if id != 0 {
			return TaskView{}, ErrInvalid
		}
		if source != nil {
			if source.Kind != "mail" || !validText(source.ID, 1, 512) || !validText(source.Label, 0, 200) {
				return TaskView{}, ErrInvalid
			}
			task.SourceKind = &source.Kind
			task.SourceRef = &source.ID
			task.SourceLabel = &source.Label
			existing, found, err := r.taskBySource(userID, source.Kind, source.ID)
			if err != nil {
				return TaskView{}, err
			}
			if found {
				old, oldSteps, err := r.task(userID, existing.ID)
				return taskView(old, oldSteps), err
			}
		}
	}
	if input.Steps != nil {
		if len(*input.Steps) > 50 {
			return TaskView{}, ErrInvalid
		}
		old := map[int64]Step{}
		for _, step := range steps {
			old[step.ID] = step
		}
		steps = []Step{}
		used := map[int64]bool{}
		for position, value := range *input.Steps {
			value.Title = strings.TrimSpace(value.Title)
			if !validText(value.Title, 1, 200) {
				return TaskView{}, ErrInvalid
			}
			step := Step{Record: Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, TodoID: task.ID}
			if value.ID != "" {
				stepID, err := parseID(value.ID)
				if err != nil {
					return TaskView{}, err
				}
				saved, ok := old[stepID]
				if !ok || used[stepID] {
					return TaskView{}, ErrInvalid
				}
				step = saved
				used[stepID] = true
			}
			step.Title = value.Title
			step.Done = value.Done
			step.Position = position
			step.UpdatedAt = now
			steps = append(steps, step)
		}
	}
	if task.Done {
		if task.CompletedAt == nil {
			task.CompletedAt = &now
		}
		for i := range steps {
			steps[i].Done = true
			steps[i].UpdatedAt = now
		}
	} else {
		task.CompletedAt = nil
	}
	task.UpdatedAt = now
	task.Version++
	if err := r.persistTask(&task, steps); err != nil {
		return TaskView{}, err
	}
	return taskView(task, steps), nil
}
func (s *Service) SaveTask(ctx context.Context, userID, id int64, input TaskRequest) (TaskView, error) {
	var result TaskView
	err := s.repo.Write(ctx, userID, func(r *Repository) error { var err error; result, err = s.saveTask(r, userID, id, input); return err })
	return result, err
}
func (s *Service) DeleteTask(ctx context.Context, userID, id int64, version int) error {
	return s.repo.Write(ctx, userID, func(r *Repository) error {
		task, _, err := r.task(userID, id)
		if err != nil {
			return err
		}
		if task.Version != version {
			return ErrConflict
		}
		return r.deleteTask(userID, id)
	})
}
