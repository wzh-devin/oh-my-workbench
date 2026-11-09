package repository

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules"
)

var assetsRuleEngine = func() *rules.Engine {
	engine, err := rules.NewEngine(rules.Config{Schema: rules.Schema{Facts: map[string]rules.Field{
		"name": {Type: rules.String}, "kind": {Type: rules.String}, "connectionId": {Type: rules.String}, "parentId": {Type: rules.String}, "size": {Type: rules.Number}, "starred": {Type: rules.Boolean}, "createdAt": {Type: rules.Date}, "updatedAt": {Type: rules.Date}, "lastOpenedAt": {Type: rules.Date, Nullable: true},
	}}, Limits: rules.Limits{MaxRuleBytes: 33 << 10, MaxDepth: 9, MaxNodes: 260, MaxArrayLength: 10, MaxStringBytes: 512}})
	if err != nil {
		panic(err)
	}
	return engine
}()

type assetsOperand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}

type assetsNode struct {
	Kind     string          `json:"kind"`
	Value    bool            `json:"value"`
	Children []assetsNode    `json:"children"`
	Child    *assetsNode     `json:"child"`
	Op       string          `json:"op"`
	Args     []assetsOperand `json:"args"`
}

const assetsKindSQL = `CASE WHEN e.kind='folder' THEN '文件夹' WHEN e.content_type LIKE 'image/%' THEN '图片' WHEN e.content_type LIKE 'video/%' THEN '视频' WHEN e.content_type LIKE 'audio/%' THEN '音频' WHEN e.name ~* '\.(csv|xls|xlsx|tsv)$' THEN '表格' WHEN e.name ~* '\.(md|txt|pdf|doc|docx|ppt|pptx|json)$' THEN '文档' WHEN e.name ~* '\.(zip|rar|7z|tar|gz)$' THEN '压缩包' ELSE '其他' END`

var assetsRuleFields = map[string]string{"name": "e.name", "kind": assetsKindSQL, "connectionId": "CAST(e.connection_id AS text)", "parentId": "e.parent_id", "size": "COALESCE(b.size_bytes,0)", "starred": "e.starred", "createdAt": "(e.created_at AT TIME ZONE 'Asia/Shanghai')::date", "updatedAt": "(e.updated_at AT TIME ZONE 'Asia/Shanghai')::date", "lastOpenedAt": "(e.last_opened_at AT TIME ZONE 'Asia/Shanghai')::date"}

func AssetsRuleSQL(document json.RawMessage) (string, []any, error) {
	if _, err := assetsRuleEngine.Compile(document); err != nil {
		return "", nil, assetdomain.ErrRule
	}
	var doc struct {
		Root assetsNode `json:"root"`
	}
	if json.Unmarshal(document, &doc) != nil {
		return "", nil, assetdomain.ErrRule
	}
	var args []any
	var walk func(assetsNode) (string, error)
	walk = func(n assetsNode) (string, error) {
		switch n.Kind {
		case "constant":
			if n.Value {
				return "TRUE", nil
			}
			return "FALSE", nil
		case "all", "any":
			parts := []string{}
			for _, child := range n.Children {
				v, err := walk(child)
				if err != nil {
					return "", err
				}
				parts = append(parts, "("+v+")")
			}
			join := " AND "
			if n.Kind == "any" {
				join = " OR "
			}
			return strings.Join(parts, join), nil
		case "not":
			if n.Child == nil {
				return "", assetdomain.ErrRule
			}
			v, err := walk(*n.Child)
			return "NOT (" + v + ")", err
		}
		if len(n.Args) < 1 || n.Args[0].Kind != "fact" {
			return "", assetdomain.ErrRule
		}
		field := n.Args[0].Path
		column, ok := assetsRuleFields[field]
		if !ok {
			return "", assetdomain.ErrRule
		}
		if n.Op == "is_null" && field == "lastOpenedAt" && len(n.Args) == 1 {
			return column + " IS NULL", nil
		}
		if len(n.Args) != 2 || n.Args[1].Kind != "constant" {
			return "", assetdomain.ErrRule
		}
		arg := n.Args[1]
		var value any
		switch field {
		case "size":
			var number int64
			if json.Unmarshal(arg.Value, &number) != nil || number < 0 || number > assetdomain.MaxFileSize {
				return "", assetdomain.ErrRule
			}
			value = number
		case "starred":
			var b bool
			if string(arg.Value) == "null" || json.Unmarshal(arg.Value, &b) != nil {
				return "", assetdomain.ErrRule
			}
			value = b
		default:
			var text string
			if json.Unmarshal(arg.Value, &text) != nil || !assetdomain.ValidText(text, 200) {
				return "", assetdomain.ErrRule
			}
			if field == "connectionId" {
				if _, err := assetdomain.ParseID(text); err != nil {
					return "", assetdomain.ErrRule
				}
			}
			if strings.HasSuffix(field, "At") {
				if _, err := time.Parse(time.DateOnly, text); err != nil {
					return "", assetdomain.ErrRule
				}
			}
			value = text
			if field == "parentId" {
				if text == "root" {
					switch n.Op {
					case "eq":
						return column + " IS NULL", nil
					case "ne":
						return column + " IS NOT NULL", nil
					default:
						return "", assetdomain.ErrRule
					}
				}
				id, err := assetdomain.ParseID(text)
				if err != nil {
					return "", assetdomain.ErrRule
				}
				value = id
			}
		}
		if n.Op == "contains" && field == "name" {
			args = append(args, "%"+assetsEscapeLike(value.(string))+"%")
			return "COALESCE(" + column + " ILIKE ? ESCAPE '\\',FALSE)", nil
		}
		ops := map[string]string{"eq": "=", "ne": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}
		op, ok := ops[n.Op]
		if !ok {
			return "", assetdomain.ErrRule
		}
		if (field == "starred" || field == "kind" || field == "connectionId" || field == "parentId" || field == "name") && n.Op != "eq" && n.Op != "ne" {
			return "", assetdomain.ErrRule
		}
		args = append(args, value)
		// 路径取反也应包含 parent_id 为 NULL 的顶层条目。
		if field == "parentId" && n.Op == "ne" {
			return column + " IS DISTINCT FROM ?", nil
		}
		return fmt.Sprintf("COALESCE(%s %s ?,FALSE)", column, op), nil
	}
	sql, err := walk(doc.Root)
	return sql, args, err
}

func assetsEscapeLike(value string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value)
}
