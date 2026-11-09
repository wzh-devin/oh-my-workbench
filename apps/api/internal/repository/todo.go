package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	tododto "github.com/devin/oh-my-workbench/api/internal/domain/dto/todos"
	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	todoresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
)

type Todo struct {
	TodoRecord
	ListID      *int64
	Title       string
	Note        string
	Done        bool
	Priority    int
	DueDate     *time.Time
	PlannedFor  *time.Time
	CompletedAt *time.Time
	Tags        []string `gorm:"serializer:json;type:jsonb"`
	SourceKind  *string
	SourceRef   *string
	SourceLabel *string
	Version     int
	LegacyID    *string
}

func (Todo) TableName() string { return "omw_todo" }

func todoDateText(value *time.Time) *string {
	if value == nil {
		return nil
	}
	text := value.Format(time.DateOnly)
	return &text
}

func TodoInfo(task Todo, steps []TodoStep) todoresp.TaskResponse {
	result := todoresp.TaskResponse{ID: task.ID, ListID: task.ListID, Title: task.Title, Note: task.Note, Done: task.Done, Priority: task.Priority, DueDate: todoDateText(task.DueDate), PlannedFor: todoDateText(task.PlannedFor), CompletedAt: task.CompletedAt, CreatedAt: task.CreatedAt, UpdatedAt: task.UpdatedAt, Tags: task.Tags, Steps: []todoresp.StepResponse{}, Version: task.Version}
	if result.Tags == nil {
		result.Tags = []string{}
	}
	if task.SourceKind != nil && task.SourceRef != nil && task.SourceLabel != nil {
		result.Source = &tododto.Source{Kind: *task.SourceKind, ID: *task.SourceRef, Label: *task.SourceLabel}
	}
	for _, step := range steps {
		result.Steps = append(result.Steps, todoresp.StepResponse{ID: step.ID, Title: step.Title, Done: step.Done})
	}
	return result
}

// 所有同用户写操作持有同一行锁，在无外键和唯一约束时维护关联与去重。
func (r *TodoRepository) Write(ctx context.Context, userID int64, fn func(*Store) error) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var id int64
		result := tx.Raw("SELECT id FROM omw_user WHERE id = ? FOR UPDATE", userID).Scan(&id)
		if result.Error != nil {
			return result.Error
		}
		if id == 0 {
			return tododomain.ErrNotFound
		}
		return fn(New(tx, nil))
	})
}

func (r *TodoRepository) ReadSnapshot(userID int64) (todoresp.SnapshotResponse, error) {
	result := todoresp.SnapshotResponse{Lists: []todoresp.ListResponse{}, Tasks: []todoresp.TaskResponse{}, Views: []todoresp.ViewResponse{}, Priorities: []todoresp.PriorityResponse{}}
	var lists []TodoList
	var tasks []Todo
	var steps []TodoStep
	if err := r.db.Where("user_id = ?", userID).Order("created_at, id").Find(&lists).Error; err != nil {
		return result, err
	}
	if err := r.db.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&tasks).Error; err != nil {
		return result, err
	}
	if err := r.db.Where("user_id = ?", userID).Order("todo_id, position, id").Find(&steps).Error; err != nil {
		return result, err
	}
	byTask := make(map[int64][]TodoStep)
	for _, step := range steps {
		byTask[step.TodoID] = append(byTask[step.TodoID], step)
	}
	for _, list := range lists {
		result.Lists = append(result.Lists, TodoListInfo(list))
	}
	for _, task := range tasks {
		result.Tasks = append(result.Tasks, TodoInfo(task, byTask[task.ID]))
	}
	views, err := r.TodoView.views(userID)
	if err != nil {
		return result, err
	}
	for _, view := range views {
		result.Views = append(result.Views, TodoViewInfo(view))
	}
	priorities, err := r.TodoPriority.Priorities(userID)
	if err != nil {
		return result, err
	}
	for _, priority := range priorities {
		result.Priorities = append(result.Priorities, TodoPriorityInfo(priority))
	}
	return result, nil
}

// 批量读取共享只读快照，避免清单删除期间得到不一致归属或N+1查询。
func (r *TodoRepository) Snapshot(ctx context.Context, userID int64) (todoresp.SnapshotResponse, error) {
	var result todoresp.SnapshotResponse
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = New(tx, nil).Todo.ReadSnapshot(userID)
		return err
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (r *TodoRepository) Task(userID, id int64) (Todo, []TodoStep, error) {
	var task Todo
	steps := []TodoStep{}
	err := r.db.Where("user_id = ? AND id = ?", userID, id).First(&task).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return task, steps, tododomain.ErrNotFound
	}
	if err != nil {
		return task, steps, err
	}
	err = r.db.Where("user_id = ? AND todo_id = ?", userID, id).Order("position, id").Find(&steps).Error
	return task, steps, err
}

func (r *TodoRepository) MoveTasksToInbox(userID, listID int64, at time.Time) ([]todoresp.TaskResponse, error) {
	var tasks []Todo
	result := []todoresp.TaskResponse{}
	if err := r.db.Where("user_id = ? AND list_id = ?", userID, listID).Find(&tasks).Error; err != nil {
		return result, err
	}
	if len(tasks) == 0 {
		return result, nil
	}
	if err := r.db.Model(&Todo{}).Where("user_id = ? AND list_id = ?", userID, listID).Updates(map[string]any{"list_id": nil, "version": gorm.Expr("version + 1"), "updated_at": at}).Error; err != nil {
		return result, err
	}
	ids := make([]int64, 0, len(tasks))
	for _, task := range tasks {
		ids = append(ids, task.ID)
	}
	var steps []TodoStep
	if err := r.db.Where("user_id = ? AND todo_id IN ?", userID, ids).Order("todo_id, position, id").Find(&steps).Error; err != nil {
		return result, err
	}
	byTask := map[int64][]TodoStep{}
	for _, step := range steps {
		byTask[step.TodoID] = append(byTask[step.TodoID], step)
	}
	for _, task := range tasks {
		task.ListID = nil
		task.Version++
		task.UpdatedAt = at
		result = append(result, TodoInfo(task, byTask[task.ID]))
	}
	return result, nil
}

func (r *TodoRepository) TaskBySource(userID int64, kind, reference string) (Todo, bool, error) {
	var task Todo
	result := r.db.Where("user_id = ? AND source_kind = ? AND source_ref = ?", userID, kind, reference).Limit(1).Find(&task)
	return task, result.RowsAffected > 0, result.Error
}

func (r *TodoRepository) PersistTask(task *Todo, steps []TodoStep) error {
	if err := r.db.Save(task).Error; err != nil {
		return err
	}
	return r.TodoStep.Replace(task.UserID, task.ID, steps)
}

func (r *TodoRepository) DeleteTask(userID, id int64) error {
	if err := r.TodoStep.Delete(userID, id); err != nil {
		return err
	}
	return r.db.Where("user_id = ? AND id = ?", userID, id).Delete(&Todo{}).Error
}

func (r *TodoRepository) TaskImported(userID int64, legacyID string) (bool, error) {
	var count int64
	err := r.db.Model(&Todo{}).Where("user_id = ? AND legacy_id = ?", userID, legacyID).Count(&count).Error
	return count > 0, err
}

func (r *TodoRepository) RecordImport(userID, id int64, legacyID string, createdAt, completedAt *time.Time) error {
	values := map[string]any{"legacy_id": legacyID}
	if createdAt != nil {
		values["created_at"] = createdAt
		if completedAt != nil {
			values["completed_at"] = completedAt
		}
	}
	return r.db.Model(&Todo{}).Where("user_id = ? AND id = ? AND legacy_id IS NULL", userID, id).Updates(values).Error
}

// DetachListTasks moves all tasks without returning an unbounded task snapshot.
func (r *TodoRepository) DetachListTasks(userID, listID int64, at time.Time) error {
	return r.db.Model(&Todo{}).Where("user_id=? AND list_id=?", userID, listID).Updates(map[string]any{"list_id": nil, "version": gorm.Expr("version + 1"), "updated_at": at}).Error
}

// TaskPage 在同一只读快照内计数与分页，步骤只批量读取本页任务。
func (r *TodoRepository) TaskPage(ctx context.Context, userID int64, input todoreq.TaskPageRequest, predicate string, args []any) (todoresp.TaskPageResponse, error) {
	out := todoresp.TaskPageResponse{Records: []todoresp.TaskResponse{}, PageNum: input.PageNum, PageSize: input.PageSize}
	err := r.db.WithContext(ctx).Transaction(func(db *gorm.DB) error {
		q := db.Table("omw_todo t").Where("t.user_id=?", userID).Where(predicate, args...)
		if input.ListID != "" {
			if input.ListID == "list-inbox" {
				q = q.Where("t.list_id IS NULL")
			} else {
				q = q.Where("t.list_id::text=?", input.ListID)
			}
		}
		if input.Search != "" {
			q = q.Where("strpos("+TodosTaskTextSQL+",?)>0", strings.ToLower(input.Search))
		}
		if e := q.Count(&out.Total).Error; e != nil {
			return e
		}
		rank := `COALESCE((SELECT p.position FROM omw_todo_priority p WHERE p.user_id=t.user_id AND p.value=t.priority),t.priority)`
		orders := map[string]string{"due": "t.due_date ASC NULLS LAST," + rank + ",t.created_at DESC,t.id DESC", "priority": rank + ",t.due_date ASC NULLS LAST,t.created_at DESC,t.id DESC", "newest": "t.created_at DESC,t.id DESC"}
		order, ok := orders[input.Sort]
		if !ok {
			return tododomain.ErrInvalid
		}
		order = "t.done ASC,CASE WHEN t.done THEN COALESCE(t.completed_at,t.created_at) END DESC NULLS LAST," + order
		tasks := []Todo{}
		if e := q.Select("t.*").Order(order).Offset((input.PageNum - 1) * input.PageSize).Limit(input.PageSize).Find(&tasks).Error; e != nil {
			return e
		}
		ids := []int64{}
		for _, t := range tasks {
			ids = append(ids, t.ID)
		}
		steps := []TodoStep{}
		if len(ids) > 0 {
			if e := db.Where("user_id=? AND todo_id IN ?", userID, ids).Order("position,id").Find(&steps).Error; e != nil {
				return e
			}
		}
		byTask := map[int64][]TodoStep{}
		for _, s := range steps {
			byTask[s.TodoID] = append(byTask[s.TodoID], s)
		}
		for _, t := range tasks {
			out.Records = append(out.Records, TodoInfo(t, byTask[t.ID]))
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

// Counts 单次SQL聚合所有视图，避免为每个侧栏视图读取任务全集。
func (r *TodoRepository) Counts(ctx context.Context, userID int64, today time.Time) (map[string]int64, error) {
	views, err := New(r.db.WithContext(ctx), nil).TodoView.views(userID)
	if err != nil {
		return nil, err
	}
	parts := []string{}
	args := []any{}
	for _, v := range views {
		p, a, e := TodosRuleSQL(v.FilterQuery, today)
		if e != nil {
			continue
		}
		if v.SearchText != "" {
			p += " AND strpos(" + TodosTaskTextSQL + ",?)>0"
			a = append(a, strings.ToLower(v.SearchText))
		}
		parts = append(parts, fmt.Sprintf(`count(*) FILTER (WHERE %s) AS "view:%d"`, p, v.ID))
		args = append(args, a...)
	}
	out := map[string]int64{}
	if len(parts) > 0 {
		args = append(args, userID)
		var raw []byte
		err = r.db.WithContext(ctx).Raw("SELECT to_jsonb(counts) FROM(SELECT "+strings.Join(parts, ",")+" FROM omw_todo t WHERE t.user_id=?) counts", args...).Row().Scan(&raw)
		if err != nil {
			return nil, err
		}
		if json.Unmarshal(raw, &out) != nil {
			return nil, tododomain.ErrInvalid
		}
	}
	var lists []struct {
		ListID  *int64
		Total   int64
		Pending int64
	}
	err = r.db.WithContext(ctx).Table("omw_todo").Select("list_id,count(*) total,count(*) FILTER(WHERE NOT done) pending").Where("user_id=?", userID).Group("list_id").Scan(&lists).Error
	for _, v := range lists {
		k := "list:list-inbox"
		if v.ListID != nil {
			k = fmt.Sprintf("list:%d", *v.ListID)
		}
		out[k] = v.Pending
		out[strings.Replace(k, "list:", "listTotal:", 1)] = v.Total
	}
	return out, err
}

type TodoRepository struct{ *Store }
