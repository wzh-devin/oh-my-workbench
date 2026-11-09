package repository

import (
	"bytes"
	"encoding/json"
	"strings"

	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules"
)

var notesEngine = func() *rules.Engine {
	e, err := rules.NewEngine(rules.Config{Schema: rules.Schema{Facts: map[string]rules.Field{
		"title": {Type: rules.String}, "tag": {Type: rules.String},
		"notebookId": {Type: rules.String}, "favorite": {Type: rules.Boolean}, "requiresUnlock": {Type: rules.Boolean},
	}}, Limits: rules.Limits{MaxRuleBytes: 33 << 10, MaxDepth: 9, MaxNodes: 260, MaxStringBytes: 512}})
	if err != nil {
		panic(err)
	}
	return e
}()

type notesOperand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Value json.RawMessage `json:"value"`
}

type notesNode struct {
	Kind     string         `json:"kind"`
	Value    bool           `json:"value"`
	Children []notesNode    `json:"children"`
	Child    *notesNode     `json:"child"`
	Op       string         `json:"op"`
	Args     []notesOperand `json:"args"`
}

// NotesRuleSQL preserves nested AND/OR/NOT; all field names are allowlisted and values bound.
func NotesRuleSQL(raw json.RawMessage) (string, []any, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return "TRUE", nil, nil
	}
	if _, err := notesEngine.Compile(raw); err != nil {
		return "", nil, notedomain.ErrInvalid
	}
	var doc struct {
		Root notesNode `json:"root"`
	}
	if json.Unmarshal(raw, &doc) != nil {
		return "", nil, notedomain.ErrInvalid
	}
	args := []any{}
	var walk func(notesNode) (string, error)
	walk = func(n notesNode) (string, error) {
		switch n.Kind {
		case "constant":
			if n.Value {
				return "TRUE", nil
			}
			return "FALSE", nil
		case "all", "any":
			parts := []string{}
			for _, child := range n.Children {
				p, err := walk(child)
				if err != nil {
					return "", err
				}
				parts = append(parts, "("+p+")")
			}
			join := " AND "
			if n.Kind == "any" {
				join = " OR "
			}
			if len(parts) == 0 {
				if n.Kind == "all" {
					return "TRUE", nil
				}
				return "FALSE", nil
			}
			return strings.Join(parts, join), nil
		case "not":
			if n.Child == nil {
				return "", notedomain.ErrInvalid
			}
			p, err := walk(*n.Child)
			return "NOT (" + p + ")", err
		case "condition":
		default:
			return "", notedomain.ErrInvalid
		}
		if len(n.Args) != 2 || n.Args[0].Kind != "fact" || n.Args[1].Kind != "constant" {
			return "", notedomain.ErrInvalid
		}
		field := n.Args[0].Path
		columns := map[string]string{"title": "n.title", "notebookId": "COALESCE(n.notebook_id::text,'unfiled')", "favorite": "n.favorite", "requiresUnlock": "n.requires_unlock"}
		col, ok := columns[field]
		if field == "tag" {
			var v string
			if json.Unmarshal(n.Args[1].Value, &v) != nil || v == "" || (n.Op != "eq" && n.Op != "ne") {
				return "", notedomain.ErrInvalid
			}
			args = append(args, v)
			p := "n.tags @> jsonb_build_array(?::text)"
			if n.Op == "ne" {
				p = "NOT (" + p + ")"
			}
			return p, nil
		}
		if !ok {
			return "", notedomain.ErrInvalid
		}
		var value any
		if field == "favorite" || field == "requiresUnlock" {
			var b bool
			if string(n.Args[1].Value) == "null" || json.Unmarshal(n.Args[1].Value, &b) != nil {
				return "", notedomain.ErrInvalid
			}
			value = b
		} else {
			var text string
			if json.Unmarshal(n.Args[1].Value, &text) != nil || len(text) > 512 {
				return "", notedomain.ErrInvalid
			}
			value = text
		}
		if n.Op == "contains" && field == "title" {
			args = append(args, strings.ToLower(value.(string)))
			return "strpos(lower(" + col + "),?)>0", nil
		}
		op := map[string]string{"eq": "=", "ne": "<>"}[n.Op]
		if op == "" {
			return "", notedomain.ErrInvalid
		}
		args = append(args, value)
		return col + " " + op + " ?", nil
	}
	p, err := walk(doc.Root)
	return p, args, err
}
