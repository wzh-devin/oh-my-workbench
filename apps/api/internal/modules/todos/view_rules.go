package todos

import (
	"encoding/json"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules"
)

var viewIcons = map[string]bool{
	"list-todo": true, "sun": true, "calendar": true, "calendar-clock": true, "check-check": true,
	"flag": true, "star": true, "heart": true, "briefcase": true, "house": true, "book-open": true,
	"coffee": true, "code": true, "target": true, "inbox": true, "folder": true, "tag": true, "zap": true,
}

// Todo 只声明字段和边界；组合与条件类型由通用引擎检查。
var viewRuleEngine = func() *rules.Engine {
	engine, err := rules.NewEngine(rules.Config{
		Schema: rules.Schema{Facts: map[string]rules.Field{
			"done": {Type: rules.Boolean, Required: true}, "listId": {Type: rules.String, Required: true},
			"priority": {Type: rules.Number, Required: true}, "tags": {Type: "string[]", Required: true},
			"plannedFor": {Type: rules.Date, Required: true, Nullable: true}, "dueDate": {Type: rules.Date, Required: true, Nullable: true},
			"text": {Type: rules.String},
		}, Context: map[string]rules.Field{
			"today": {Type: rules.Date, Required: true}, "yesterday": {Type: rules.Date, Required: true}, "tomorrow": {Type: rules.Date, Required: true},
		}},
		// 文本fact包含备注和步骤，常量仍限制200字；旧关键词归并预留4节点与1KiB。
		Limits: rules.Limits{MaxRuleBytes: 33 << 10, MaxDepth: 9, MaxNodes: 260, MaxArrayLength: 10, MaxStringBytes: 64 << 10},
	})
	if err != nil {
		panic(err)
	}
	return engine
}()

type ruleOperand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}
type ruleNode struct {
	Kind     string        `json:"kind"`
	Children []ruleNode    `json:"children"`
	Child    *ruleNode     `json:"child"`
	Args     []ruleOperand `json:"args"`
	Op       string        `json:"op"`
}

func validateViewRule(document json.RawMessage) ([]int64, error) {
	if _, err := viewRuleEngine.Compile(document); err != nil {
		return nil, ErrRule
	}
	var rule struct {
		Root ruleNode `json:"root"`
	}
	if json.Unmarshal(document, &rule) != nil {
		return nil, ErrRule
	}
	listIDs := map[int64]bool{}
	var walk func(ruleNode) error
	walk = func(node ruleNode) error {
		switch node.Kind {
		case "constant":
			return nil
		case "all", "any":
			for _, child := range node.Children {
				if err := walk(child); err != nil {
					return err
				}
			}
			return nil
		case "not":
			if node.Child == nil {
				return ErrRule
			}
			return walk(*node.Child)
		}
		if len(node.Args) == 0 || node.Args[0].Kind != "fact" {
			return ErrRule
		}
		field := node.Args[0].Path
		if node.Op == "is_null" && (field == "dueDate" || field == "plannedFor") {
			return nil
		}
		if node.Op == "is_empty" && field == "tags" {
			return nil
		}
		if len(node.Args) != 2 {
			return ErrRule
		}
		arg := node.Args[1]
		if field == "dueDate" || field == "plannedFor" {
			if node.Op != "eq" && node.Op != "ne" && node.Op != "gt" && node.Op != "gte" && node.Op != "lt" && node.Op != "lte" {
				return ErrRule
			}
			if arg.Kind == "context" && (arg.Path == "today" || arg.Path == "yesterday" || arg.Path == "tomorrow") {
				return nil
			}
			var date string
			if arg.Kind != "constant" || arg.Type != "date" || json.Unmarshal(arg.Value, &date) != nil {
				return ErrRule
			}
			parsed, err := time.Parse(time.DateOnly, date)
			if err != nil || parsed.Year() < 1 {
				return ErrRule
			}
			return nil
		}
		if arg.Kind != "constant" {
			return ErrRule
		}
		switch field {
		case "text":
			var text string
			if node.Op != "contains" || json.Unmarshal(arg.Value, &text) != nil || !validText(text, 1, 200) {
				return ErrRule
			}
		case "done":
			var v bool
			if (node.Op != "eq" && node.Op != "ne") || string(arg.Value) == "null" || json.Unmarshal(arg.Value, &v) != nil {
				return ErrRule
			}
		case "listId":
			var v string
			if (node.Op != "eq" && node.Op != "ne") || json.Unmarshal(arg.Value, &v) != nil {
				return ErrRule
			}
			if v != "list-inbox" {
				id, err := parseID(v)
				if err != nil {
					return ErrRule
				}
				listIDs[id] = true
			}
		case "priority":
			var v int
			if (node.Op != "eq" && node.Op != "ne") || json.Unmarshal(arg.Value, &v) != nil || v < 1 || v > 4 {
				return ErrRule
			}
		case "tags":
			var tags []string
			if (node.Op != "has_any" && node.Op != "has_all") || json.Unmarshal(arg.Value, &tags) != nil || len(tags) == 0 || len(tags) > 10 {
				return ErrRule
			}
			for _, tag := range tags {
				if !validText(tag, 1, 24) {
					return ErrRule
				}
			}
		default:
			return ErrRule
		}
		return nil
	}
	if err := walk(rule.Root); err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(listIDs))
	for id := range listIDs {
		ids = append(ids, id)
	}
	return ids, nil
}

var defaultViews = []struct{ key, name, icon, rule string }{
	{"all", "全部待办", "list-todo", `{"schemaVersion":1,"root":{"kind":"constant","value":true}}`},
	{"myday", "我的一天", "sun", `{"schemaVersion":1,"root":{"kind":"all","children":[{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"done"},{"kind":"constant","value":false}]},{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"plannedFor"},{"kind":"context","path":"today"}]}]}}`},
	{"overdue", "已逾期", "calendar-clock", `{"schemaVersion":1,"root":{"kind":"all","children":[{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"done"},{"kind":"constant","value":false}]},{"kind":"condition","op":"lt","args":[{"kind":"fact","path":"dueDate"},{"kind":"context","path":"today"}]}]}}`},
	{"completed", "已完成", "check-check", `{"schemaVersion":1,"root":{"kind":"condition","op":"eq","args":[{"kind":"fact","path":"done"},{"kind":"constant","value":true}]}}`},
}
