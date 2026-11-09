package repository

import (
	"encoding/json"
	"strings"
	"time"

	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
)

type todosQueryOperand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
}

type todosQueryNode struct {
	Kind     string              `json:"kind"`
	Value    bool                `json:"value"`
	Op       string              `json:"op"`
	Args     []todosQueryOperand `json:"args"`
	Children []todosQueryNode    `json:"children"`
	Child    *todosQueryNode     `json:"child"`
}

const TodosTaskTextSQL = `lower(concat_ws(' ',t.title,t.note,COALESCE((SELECT string_agg(tag,' ') FROM jsonb_array_elements_text(t.tags) tag),''),COALESCE((SELECT string_agg(s.title,' ' ORDER BY s.position,s.id) FROM omw_todo_step s WHERE s.user_id=t.user_id AND s.todo_id=t.id),'')))`

// TodosRuleSQL 仅接受已校验AST的白名单字段和参数值；NULL条件取反保持与规则引擎一致。
func TodosRuleSQL(document json.RawMessage, today time.Time) (string, []any, error) {
	var doc struct {
		Root todosQueryNode `json:"root"`
	}
	if json.Unmarshal(document, &doc) != nil {
		return "", nil, tododomain.ErrRule
	}
	var args []any
	var walk func(todosQueryNode) (string, error)
	walk = func(n todosQueryNode) (string, error) {
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
				return "", tododomain.ErrRule
			}
			p, e := walk(*n.Child)
			return "NOT (" + p + ")", e
		case "condition":
		default:
			return "", tododomain.ErrRule
		}
		if len(n.Args) < 1 || n.Args[0].Kind != "fact" {
			return "", tododomain.ErrRule
		}
		field := n.Args[0].Path
		columns := map[string]string{"done": "t.done", "priority": "t.priority", "listId": "COALESCE(t.list_id::text,'list-inbox')", "dueDate": "t.due_date", "plannedFor": "t.planned_for", "tags": "t.tags", "text": TodosTaskTextSQL}
		col, ok := columns[field]
		if !ok {
			return "", tododomain.ErrRule
		}
		if n.Op == "is_null" && len(n.Args) == 1 && (field == "dueDate" || field == "plannedFor") {
			return col + " IS NULL", nil
		}
		if n.Op == "is_empty" && len(n.Args) == 1 && field == "tags" {
			return "COALESCE(jsonb_array_length(t.tags),0)=0", nil
		}
		if len(n.Args) != 2 {
			return "", tododomain.ErrRule
		}
		v := n.Args[1]
		var value any
		if v.Kind == "context" && (field == "dueDate" || field == "plannedFor") {
			days := map[string]int{"today": 0, "yesterday": -1, "tomorrow": 1}
			delta, ok := days[v.Path]
			if !ok {
				return "", tododomain.ErrRule
			}
			value = today.AddDate(0, 0, delta).Format(time.DateOnly)
		} else if v.Kind == "constant" {
			switch field {
			case "done":
				var b bool
				if string(v.Value) == "null" || json.Unmarshal(v.Value, &b) != nil {
					return "", tododomain.ErrRule
				}
				value = b
			case "priority":
				var i int
				if json.Unmarshal(v.Value, &i) != nil || i < 1 || i > 4 {
					return "", tododomain.ErrRule
				}
				value = i
			case "tags":
				var tags []string
				if json.Unmarshal(v.Value, &tags) != nil || len(tags) < 1 || len(tags) > 10 {
					return "", tododomain.ErrRule
				}
				if n.Op != "has_all" && n.Op != "has_any" {
					return "", tododomain.ErrRule
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
					return "", tododomain.ErrRule
				}
				value = text
			}
		} else {
			return "", tododomain.ErrRule
		}
		if n.Op == "contains" && field == "text" {
			args = append(args, strings.ToLower(value.(string)))
			return "strpos(" + col + ",?)>0", nil
		}
		ops := map[string]string{"eq": "=", "ne": "<>", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}
		op, ok := ops[n.Op]
		if !ok {
			return "", tododomain.ErrRule
		}
		if field == "tags" || field == "text" {
			return "", tododomain.ErrRule
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
