package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	d "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	"gorm.io/gorm"
)

type queryOperand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
}
type queryNode struct {
	Kind     string         `json:"kind"`
	Value    bool           `json:"value"`
	Op       string         `json:"op"`
	Args     []queryOperand `json:"args"`
	Children []queryNode    `json:"children"`
	Child    *queryNode     `json:"child"`
}

const TaskTextSQL = `lower(concat_ws(' ',t.title,t.note,COALESCE((SELECT string_agg(tag,' ') FROM jsonb_array_elements_text(t.tags) tag),''),COALESCE((SELECT string_agg(s.title,' ' ORDER BY s.position,s.id) FROM omw_todo_step s WHERE s.user_id=t.user_id AND s.todo_id=t.id),'')))`

// RuleSQL 仅接受已校验AST的白名单字段和参数值；NULL条件取反保持与规则引擎一致。
func RuleSQL(document json.RawMessage, today time.Time) (string, []any, error) {
	var doc struct {
		Root queryNode `json:"root"`
	}
	if json.Unmarshal(document, &doc) != nil {
		return "", nil, d.ErrRule
	}
	var args []any
	var walk func(queryNode) (string, error)
	walk = func(n queryNode) (string, error) {
		switch n.Kind {
		case "constant":
			if n.Value {
				return "TRUE", nil
			}
			return "FALSE", nil
		case "all", "any":
			if len(n.Children) == 0 {
				if n.Kind == "all" {
					return "TRUE", nil
				}
				return "FALSE", nil
			}
			parts := []string{}
			for _, child := range n.Children {
				p, e := walk(child)
				if e != nil {
					return "", e
				}
				parts = append(parts, "("+p+")")
			}
			join := " AND "
			if n.Kind == "any" {
				join = " OR "
			}
			return strings.Join(parts, join), nil
		case "not":
			if n.Child == nil {
				return "", d.ErrRule
			}
			p, e := walk(*n.Child)
			return "NOT (" + p + ")", e
		case "condition":
		default:
			return "", d.ErrRule
		}
		if len(n.Args) < 1 || n.Args[0].Kind != "fact" {
			return "", d.ErrRule
		}
		field := n.Args[0].Path
		columns := map[string]string{"done": "t.done", "priority": "t.priority", "listId": "COALESCE(t.list_id::text,'list-inbox')", "dueDate": "t.due_date", "plannedFor": "t.planned_for", "tags": "t.tags", "text": TaskTextSQL}
		col, ok := columns[field]
		if !ok {
			return "", d.ErrRule
		}
		if n.Op == "is_null" && len(n.Args) == 1 && (field == "dueDate" || field == "plannedFor") {
			return col + " IS NULL", nil
		}
		if n.Op == "is_empty" && len(n.Args) == 1 && field == "tags" {
			return "COALESCE(jsonb_array_length(t.tags),0)=0", nil
		}
		if len(n.Args) != 2 {
			return "", d.ErrRule
		}
		v := n.Args[1]
		var value any
		if v.Kind == "context" && (field == "dueDate" || field == "plannedFor") {
			days := map[string]int{"today": 0, "yesterday": -1, "tomorrow": 1}
			delta, ok := days[v.Path]
			if !ok {
				return "", d.ErrRule
			}
			value = today.AddDate(0, 0, delta).Format(time.DateOnly)
		} else if v.Kind == "constant" {
			switch field {
			case "done":
				var b bool
				if string(v.Value) == "null" || json.Unmarshal(v.Value, &b) != nil {
					return "", d.ErrRule
				}
				value = b
			case "priority":
				var i int
				if json.Unmarshal(v.Value, &i) != nil || i < 1 || i > 4 {
					return "", d.ErrRule
				}
				value = i
			case "tags":
				var tags []string
				if json.Unmarshal(v.Value, &tags) != nil || len(tags) < 1 || len(tags) > 10 {
					return "", d.ErrRule
				}
				if n.Op != "has_all" && n.Op != "has_any" {
					return "", d.ErrRule
				}
				clauses := []string{}
				for _, tag := range tags {
					args = append(args, tag)
					clauses = append(clauses, "COALESCE(t.tags @> jsonb_build_array(?::text),FALSE)")
				}
				join := " AND "
				if n.Op == "has_any" {
					join = " OR "
				}
				return "(" + strings.Join(clauses, join) + ")", nil
			default:
				var text string
				if json.Unmarshal(v.Value, &text) != nil {
					return "", d.ErrRule
				}
				value = text
			}
		} else {
			return "", d.ErrRule
		}
		if n.Op == "contains" && field == "text" {
			args = append(args, strings.ToLower(value.(string)))
			return "strpos(" + col + ",?)>0", nil
		}
		ops := map[string]string{"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}
		op, ok := ops[n.Op]
		if !ok {
			return "", d.ErrRule
		}
		if field == "tags" || field == "text" {
			return "", d.ErrRule
		}
		args = append(args, value)
		fallback := "FALSE"
		if n.Op == "ne" {
			fallback = "TRUE"
		}
		return "COALESCE(" + col + " " + op + " ?," + fallback + ")", nil
	}
	predicate, err := walk(doc.Root)
	return predicate, args, err
}

// TaskPage 在同一只读快照内计数与分页，步骤只批量读取本页任务。
func (r *Repository) TaskPage(ctx context.Context, userID int64, input d.QueryInput, predicate string, args []any) (d.TaskPage, error) {
	out := d.TaskPage{Records: []d.TaskView{}, PageNum: input.PageNum, PageSize: input.PageSize}
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
			q = q.Where("strpos("+TaskTextSQL+",?)>0", strings.ToLower(input.Search))
		}
		if e := q.Count(&out.Total).Error; e != nil {
			return e
		}
		rank := `COALESCE((SELECT p.position FROM omw_todo_priority p WHERE p.user_id=t.user_id AND p.value=t.priority),t.priority)`
		orders := map[string]string{"due": "t.due_date ASC NULLS LAST," + rank + ",t.created_at DESC,t.id DESC", "priority": rank + ",t.due_date ASC NULLS LAST,t.created_at DESC,t.id DESC", "newest": "t.created_at DESC,t.id DESC"}
		order, ok := orders[input.Sort]
		if !ok {
			return d.ErrInvalid
		}
		order = "t.done ASC,CASE WHEN t.done THEN COALESCE(t.completed_at,t.created_at) END DESC NULLS LAST," + order
		tasks := []d.Task{}
		if e := q.Select("t.*").Order(order).Offset((input.PageNum - 1) * input.PageSize).Limit(input.PageSize).Find(&tasks).Error; e != nil {
			return e
		}
		ids := []int64{}
		for _, t := range tasks {
			ids = append(ids, t.ID)
		}
		steps := []d.Step{}
		if len(ids) > 0 {
			if e := db.Where("user_id=? AND todo_id IN ?", userID, ids).Order("position,id").Find(&steps).Error; e != nil {
				return e
			}
		}
		byTask := map[int64][]d.Step{}
		for _, s := range steps {
			byTask[s.TodoID] = append(byTask[s.TodoID], s)
		}
		for _, t := range tasks {
			out.Records = append(out.Records, d.ToTaskView(t, byTask[t.ID]))
		}
		return nil
	}, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	return out, err
}

func (r *Repository) Lists(ctx context.Context, userID int64) ([]d.ListView, error) {
	lists := []d.List{}
	err := r.db.WithContext(ctx).Where("user_id=?", userID).Order("created_at,id").Find(&lists).Error
	out := []d.ListView{}
	for _, v := range lists {
		out = append(out, d.ToListView(v))
	}
	return out, err
}
func (r *Repository) Views(ctx context.Context, userID int64) ([]d.ViewInfo, error) {
	views, err := NewRepository(r.db.WithContext(ctx)).views(userID)
	out := []d.ViewInfo{}
	for _, v := range views {
		out = append(out, d.ToViewInfo(v))
	}
	return out, err
}
func (r *Repository) ReadPriorities(ctx context.Context, userID int64) ([]d.PriorityInfo, error) {
	values, err := NewRepository(r.db.WithContext(ctx)).Priorities(userID)
	out := []d.PriorityInfo{}
	for _, v := range values {
		out = append(out, d.ToPriorityInfo(v))
	}
	return out, err
}

// Counts 单次SQL聚合所有视图，避免为每个侧栏视图读取任务全集。
func (r *Repository) Counts(ctx context.Context, userID int64, today time.Time) (map[string]int64, error) {
	views, err := NewRepository(r.db.WithContext(ctx)).views(userID)
	if err != nil {
		return nil, err
	}
	parts := []string{}
	args := []any{}
	for _, v := range views {
		p, a, e := RuleSQL(v.FilterQuery, today)
		if e != nil {
			continue
		}
		if v.SearchText != "" {
			p += " AND strpos(" + TaskTextSQL + ",?)>0"
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
			return nil, d.ErrInvalid
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
