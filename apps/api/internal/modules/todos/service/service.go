package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	todorepo "github.com/devin/oh-my-workbench/api/internal/modules/todos/repository"
	"github.com/devin/oh-my-workbench/api/internal/shared/idgen"
)

type Service struct{ repo *todorepo.Repository }

func NewService(repo *todorepo.Repository) *Service { return &Service{repo} }

func (s *Service) Snapshot(ctx context.Context, userID int64) (tododomain.Snapshot, error) {
	snapshot, err := s.repo.Snapshot(ctx, userID)
	if err != nil {
		return snapshot, err
	}
	if len(snapshot.Views) > 0 && len(snapshot.Priorities) == 4 {
		return snapshot, nil
	}
	if err := s.repo.Write(ctx, userID, func(r *todorepo.Repository) error { return s.ensureConfiguration(r, userID) }); err != nil {
		return tododomain.Snapshot{}, err
	}
	return s.repo.Snapshot(ctx, userID)
}

func (s *Service) SaveList(ctx context.Context, userID, id int64, input tododomain.ListRequest) (tododomain.ListView, error) {
	var result tododomain.ListView
	name, err := tododomain.NormalizeName(input.Name)
	if err == nil && name == "收集箱" {
		err = tododomain.ErrListName
	}
	if err != nil {
		return result, err
	}
	err = s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		now := time.Now().UTC()
		list := tododomain.List{Record: tododomain.Record{ID: id, UserID: userID, CreatedAt: now, UpdatedAt: now}}
		if id != 0 {
			var err error
			list, err = r.List(userID, id)
			if err != nil {
				return err
			}
		} else {
			list.ID = idgen.Next()
		}
		if err := r.NameAvailable(userID, name, id); err != nil {
			return err
		}
		list.Name = name
		list.UpdatedAt = now
		if err := r.SaveList(&list); err != nil {
			return err
		}
		result = tododomain.ToListView(list)
		return nil
	})
	return result, err
}

func (s *Service) DeleteList(ctx context.Context, userID, id int64) (tododomain.DeleteListResult, error) {
	result := tododomain.DeleteListResult{ID: id, Tasks: []tododomain.TaskView{}}
	err := s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		if _, err := r.List(userID, id); err != nil {
			return err
		}
		moved, err := r.MoveTasksToInbox(userID, id, time.Now().UTC())
		if err != nil {
			return err
		}
		if err := r.DeleteList(userID, id); err != nil {
			return err
		}
		result.Tasks = moved
		return nil
	})
	return result, err
}

// PATCH 先合并当前版本再完整校验，状态与步骤在同一个用户事务中保存。
func (s *Service) saveTask(r *todorepo.Repository, userID, id int64, input tododomain.TaskRequest) (tododomain.TaskView, error) {
	now := time.Now().UTC()
	task := tododomain.Task{Record: tododomain.Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, Priority: 4, Tags: []string{}}
	steps := []tododomain.Step{}
	if id != 0 {
		var err error
		task, steps, err = r.Task(userID, id)
		if err != nil {
			return tododomain.TaskView{}, err
		}
		if input.Version != task.Version {
			return tododomain.TaskView{}, tododomain.ErrConflict
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
	if !tododomain.ValidText(task.Title, 1, 200) || !tododomain.ValidText(task.Note, 0, 2000) || task.Priority < 1 || task.Priority > 4 {
		return tododomain.TaskView{}, tododomain.ErrInvalid
	}
	if len(input.ListID) > 0 {
		task.ListID = nil
		if string(input.ListID) != "null" {
			var text string
			if json.Unmarshal(input.ListID, &text) != nil {
				return tododomain.TaskView{}, tododomain.ErrInvalid
			}
			listID, err := tododomain.ParseID(text)
			if err != nil {
				return tododomain.TaskView{}, err
			}
			task.ListID = &listID
		}
	}
	if task.ListID != nil {
		if _, err := r.List(userID, *task.ListID); err != nil {
			return tododomain.TaskView{}, err
		}
	}
	var err error
	task.DueDate, err = tododomain.ParseDate(input.DueDate, task.DueDate)
	if err != nil {
		return tododomain.TaskView{}, err
	}
	task.PlannedFor, err = tododomain.ParseDate(input.PlannedFor, task.PlannedFor)
	if err != nil {
		return tododomain.TaskView{}, err
	}
	if input.Tags != nil {
		if len(*input.Tags) > 10 {
			return tododomain.TaskView{}, tododomain.ErrInvalid
		}
		task.Tags = []string{}
		seen := map[string]bool{}
		for _, tag := range *input.Tags {
			tag = strings.TrimSpace(tag)
			if !tododomain.ValidText(tag, 1, 24) {
				return tododomain.TaskView{}, tododomain.ErrInvalid
			}
			if !seen[tag] {
				task.Tags = append(task.Tags, tag)
				seen[tag] = true
			}
		}
	}
	if len(input.Source) > 0 {
		// 来源只在创建时确定；引用本身不作为读取邮件或其他用户数据的授权凭据。
		var source *tododomain.Source
		if json.Unmarshal(input.Source, &source) != nil {
			return tododomain.TaskView{}, tododomain.ErrInvalid
		}
		if id != 0 {
			return tododomain.TaskView{}, tododomain.ErrInvalid
		}
		if source != nil {
			if source.Kind != "mail" || !tododomain.ValidText(source.ID, 1, 512) || !tododomain.ValidText(source.Label, 0, 200) {
				return tododomain.TaskView{}, tododomain.ErrInvalid
			}
			task.SourceKind = &source.Kind
			task.SourceRef = &source.ID
			task.SourceLabel = &source.Label
			existing, found, err := r.TaskBySource(userID, source.Kind, source.ID)
			if err != nil {
				return tododomain.TaskView{}, err
			}
			if found {
				old, oldSteps, err := r.Task(userID, existing.ID)
				return tododomain.ToTaskView(old, oldSteps), err
			}
		}
	}
	if input.Steps != nil {
		if len(*input.Steps) > 50 {
			return tododomain.TaskView{}, tododomain.ErrInvalid
		}
		old := map[int64]tododomain.Step{}
		for _, step := range steps {
			old[step.ID] = step
		}
		steps = []tododomain.Step{}
		used := map[int64]bool{}
		for position, value := range *input.Steps {
			value.Title = strings.TrimSpace(value.Title)
			if !tododomain.ValidText(value.Title, 1, 200) {
				return tododomain.TaskView{}, tododomain.ErrInvalid
			}
			step := tododomain.Step{Record: tododomain.Record{ID: idgen.Next(), UserID: userID, CreatedAt: now, UpdatedAt: now}, TodoID: task.ID}
			if value.ID != "" {
				stepID, err := tododomain.ParseID(value.ID)
				if err != nil {
					return tododomain.TaskView{}, err
				}
				saved, ok := old[stepID]
				if !ok || used[stepID] {
					return tododomain.TaskView{}, tododomain.ErrInvalid
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
	if err := r.PersistTask(&task, steps); err != nil {
		return tododomain.TaskView{}, err
	}
	return tododomain.ToTaskView(task, steps), nil
}

func (s *Service) SaveTask(ctx context.Context, userID, id int64, input tododomain.TaskRequest) (tododomain.TaskView, error) {
	var result tododomain.TaskView
	err := s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		var err error
		result, err = s.saveTask(r, userID, id, input)
		return err
	})
	return result, err
}

func (s *Service) DeleteTask(ctx context.Context, userID, id int64, version int) error {
	return s.repo.Write(ctx, userID, func(r *todorepo.Repository) error {
		task, _, err := r.Task(userID, id)
		if err != nil {
			return err
		}
		if task.Version != version {
			return tododomain.ErrConflict
		}
		return r.DeleteTask(userID, id)
	})
}
