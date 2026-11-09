package repository

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules"
)

var mailMailRuleEngine = func() *rules.Engine {
	e, err := rules.NewEngine(rules.Config{Schema: rules.Schema{Facts: map[string]rules.Field{
		"read": {Type: rules.Boolean, Required: true}, "starred": {Type: rules.Boolean, Required: true},
		"sender": {Type: rules.String, Required: true}, "address": {Type: rules.String, Required: true},
		"subject": {Type: rules.String, Required: true}, "accountId": {Type: rules.String, Required: true},
		"hasAttachment": {Type: rules.Boolean, Required: true}, "receivedAt": {Type: rules.Timestamp, Required: true},
	}}, Limits: rules.Limits{MaxRuleBytes: 8192, MaxDepth: 8, MaxNodes: 128}})
	if err != nil {
		panic(err)
	}
	return e
}()

type mailQueryNode struct {
	Kind     string          `json:"kind"`
	Value    bool            `json:"value"`
	Children []mailQueryNode `json:"children"`
	Child    *mailQueryNode  `json:"child"`
	Op       string          `json:"op"`
	Args     []struct {
		Kind  string          `json:"kind"`
		Path  string          `json:"path"`
		Value json.RawMessage `json:"value"`
	} `json:"args"`
}

type MailMessagePredicate = clause.Expression

func MailQueryPredicate(raw json.RawMessage) (clause.Expression, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return nil, nil
	}
	if _, err := mailMailRuleEngine.Compile(raw); err != nil {
		return nil, maildomain.ErrInvalid
	}
	var doc struct {
		Root mailQueryNode `json:"root"`
	}
	if json.Unmarshal(raw, &doc) != nil {
		return nil, maildomain.ErrInvalid
	}
	return mailNodePredicate(doc.Root)
}

func mailNodePredicate(n mailQueryNode) (clause.Expression, error) {
	switch n.Kind {
	case "constant":
		return clause.Expr{SQL: "?", Vars: []any{n.Value}}, nil
	case "all", "any":
		children := []clause.Expression{}
		for _, child := range n.Children {
			expression, err := mailNodePredicate(child)
			if err != nil {
				return nil, err
			}
			children = append(children, expression)
		}
		if len(children) == 0 {
			return clause.Expr{SQL: "?", Vars: []any{n.Kind == "all"}}, nil
		}
		// GORM 将单子项 OrConditions 当成父级 OR 连接符，先折叠等价单条件分组。
		if len(children) == 1 {
			return children[0], nil
		}
		if n.Kind == "all" {
			return clause.And(children...), nil
		}
		return clause.Or(children...), nil
	case "not":
		if n.Child == nil {
			return nil, maildomain.ErrInvalid
		}
		child, err := mailNodePredicate(*n.Child)
		if err != nil {
			return nil, err
		}
		return clause.Not(child), nil
	case "condition":
		return mailConditionPredicate(n)
	}
	return nil, maildomain.ErrInvalid
}

func mailEscapeLike(value string) string {
	return strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(value)
}

// mailConditionPredicate 只接受 fact 与常量；字段、操作符不拼接用户输入。
func mailConditionPredicate(n mailQueryNode) (clause.Expression, error) {
	if len(n.Args) != 2 || n.Args[0].Kind != "fact" || n.Args[1].Kind != "constant" {
		return nil, maildomain.ErrInvalid
	}
	field := n.Args[0].Path
	column := map[string]string{"read": "is_read", "starred": "is_starred", "sender": "sender", "address": "address", "subject": "subject", "accountId": "account_id", "receivedAt": "received_at"}[field]
	var value any
	if field == "read" || field == "starred" || field == "hasAttachment" {
		var v bool
		if json.Unmarshal(n.Args[1].Value, &v) != nil || (n.Op != "eq" && n.Op != "ne") {
			return nil, maildomain.ErrInvalid
		}
		if field == "hasAttachment" {
			if n.Op == "ne" {
				v = !v
			}
			return clause.Expr{SQL: "(m.attachment_count > 0) = ?", Vars: []any{v}}, nil
		}
		value = v
	} else {
		var v string
		if column == "" || json.Unmarshal(n.Args[1].Value, &v) != nil || utf8.RuneCountInString(v) > 200 {
			return nil, maildomain.ErrInvalid
		}
		value = v
		if field == "accountId" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 || (n.Op != "eq" && n.Op != "ne") {
				return nil, maildomain.ErrInvalid
			}
			value = id
		} else if field == "receivedAt" {
			parsed, err := time.Parse(time.RFC3339Nano, v)
			if err != nil {
				return nil, maildomain.ErrInvalid
			}
			value = parsed
		} else if n.Op == "contains" {
			return clause.Like{Column: clause.Column{Table: "m", Name: column}, Value: "%" + mailEscapeLike(v) + "%"}, nil
		}
	}
	col := clause.Column{Table: "m", Name: column}
	switch n.Op {
	case "eq":
		return clause.Eq{Column: col, Value: value}, nil
	case "ne":
		return clause.Neq{Column: col, Value: value}, nil
	case "lt", "lte", "gt", "gte":
		if field != "receivedAt" {
			return nil, maildomain.ErrInvalid
		}
		switch n.Op {
		case "lt":
			return clause.Lt{Column: col, Value: value}, nil
		case "lte":
			return clause.Lte{Column: col, Value: value}, nil
		case "gt":
			return clause.Gt{Column: col, Value: value}, nil
		case "gte":
			return clause.Gte{Column: col, Value: value}, nil
		}
	}
	return nil, maildomain.ErrInvalid
}

// mailFilteredMessages 供分页和集合操作共用；正文永远不参与列表查询。
func mailFilteredMessages(db *gorm.DB, userID, accountID int64, input mailreq.MessagePageRequest, predicate clause.Expression) *gorm.DB {
	q := mailCurrentMessages(db, userID).Where("m.is_archived = ?", input.Archived)
	if accountID != 0 {
		q = q.Where("m.account_id = ?", accountID)
	}
	if input.SearchText != "" {
		pattern := "%" + mailEscapeLike(input.SearchText) + "%"
		q = q.Where("(m.subject ILIKE ? OR m.sender ILIKE ? OR m.address ILIKE ?)", pattern, pattern, pattern)
	}
	if predicate != nil {
		q = q.Where(predicate)
	}
	return q
}
