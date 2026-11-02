package service

import (
	"context"
	d "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	r "github.com/devin/oh-my-workbench/api/internal/modules/todos/repository"
	"time"
)

// DeleteBatch is all-or-nothing, including ownership, versions and the last-view guard.
func (s *Service) DeleteBatch(ctx context.Context, userID int64, resource string, items []d.BatchItem) error {
	if len(items) < 1 || len(items) > 100 {
		return d.ErrInvalid
	}
	ids := make([]int64, len(items))
	seen := map[int64]bool{}
	for i, item := range items {
		id, e := d.ParseID(item.ID)
		if e != nil || seen[id] || resource != "lists" && item.Version < 1 {
			return d.ErrInvalid
		}
		seen[id] = true
		ids[i] = id
	}
	return s.repo.Write(ctx, userID, func(repo *r.Repository) error {
		if resource == "views" {
			count, e := repo.ViewCount(userID)
			if e != nil {
				return e
			}
			if count <= int64(len(items)) {
				return d.ErrLastView
			}
		}
		for i, id := range ids {
			switch resource {
			case "tasks":
				task, _, e := repo.Task(userID, id)
				if e != nil {
					return e
				}
				if task.Version != items[i].Version {
					return d.ErrConflict
				}
				if e = repo.DeleteTask(userID, id); e != nil {
					return e
				}
			case "views":
				view, e := repo.FindView(userID, id)
				if e != nil {
					return e
				}
				if view.Version != items[i].Version {
					return d.ErrConflict
				}
				if e = repo.DeleteView(userID, id, time.Now().UTC()); e != nil {
					return e
				}
			case "lists":
				if _, e := repo.List(userID, id); e != nil {
					return e
				}
				if e := repo.DetachListTasks(userID, id, time.Now().UTC()); e != nil {
					return e
				}
				if e := repo.DeleteList(userID, id); e != nil {
					return e
				}
			default:
				return d.ErrInvalid
			}
		}
		return nil
	})
}
