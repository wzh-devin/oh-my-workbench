package todos

import (
	"context"
	"time"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

// DeleteBatch is all-or-nothing, including ownership, versions and the last-view guard.
func (s *Service) DeleteBatch(ctx context.Context, userID int64, resource string, items []todoreq.BatchItemRequest) error {
	if len(items) < 1 || len(items) > 100 {
		return tododomain.ErrInvalid
	}
	ids := make([]int64, len(items))
	seen := map[int64]bool{}
	for i, item := range items {
		id, e := tododomain.ParseID(item.ID)
		if e != nil || seen[id] || resource != "lists" && item.Version < 1 {
			return tododomain.ErrInvalid
		}
		seen[id] = true
		ids[i] = id
	}
	return s.repo.Todo.Write(ctx, userID, func(repo *repository.Store) error {
		if resource == "views" {
			count, e := repo.TodoView.ViewCount(userID)
			if e != nil {
				return e
			}
			if count <= int64(len(items)) {
				return tododomain.ErrLastView
			}
		}
		for i, id := range ids {
			switch resource {
			case "tasks":
				task, _, e := repo.Todo.Task(userID, id)
				if e != nil {
					return e
				}
				if task.Version != items[i].Version {
					return tododomain.ErrConflict
				}
				if e = repo.Todo.DeleteTask(userID, id); e != nil {
					return e
				}
			case "views":
				view, e := repo.TodoView.FindView(userID, id)
				if e != nil {
					return e
				}
				if view.Version != items[i].Version {
					return tododomain.ErrConflict
				}
				if e = repo.TodoView.DeleteView(userID, id, time.Now().UTC()); e != nil {
					return e
				}
			case "lists":
				if _, e := repo.TodoList.List(userID, id); e != nil {
					return e
				}
				if e := repo.Todo.DetachListTasks(userID, id, time.Now().UTC()); e != nil {
					return e
				}
				if e := repo.TodoList.DeleteList(userID, id); e != nil {
					return e
				}
			default:
				return tododomain.ErrInvalid
			}
		}
		return nil
	})
}
