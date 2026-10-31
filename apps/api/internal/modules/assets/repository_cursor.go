// 游标保留最后排序值，锚点被删除仍可继续；不参与鉴权或替代查询规则。
package assets

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"time"
)

type entryCursor struct {
	Scope  string `json:"scope"`
	ID     int64  `json:"id,string"`
	Folder bool   `json:"folder"`
	Value  string `json:"value"`
	Null   bool   `json:"null"`
}

type entryOrder struct{ column, kind, direction string }

func queryOrder(sort string) entryOrder {
	orders := map[string]entryOrder{
		"name": {"e.normalized_name", "name", "ASC"}, "name-desc": {"e.normalized_name", "name", "DESC"},
		"date": {"e.updated_at", "date", "DESC"}, "date-asc": {"e.updated_at", "date", "ASC"},
		"created": {"e.created_at", "created", "DESC"}, "created-asc": {"e.created_at", "created", "ASC"},
		"size": {"COALESCE(b.size_bytes,0)", "size", "DESC"}, "size-asc": {"COALESCE(b.size_bytes,0)", "size", "ASC"},
		"opened": {"e.last_opened_at", "opened", "DESC"},
	}
	if order, ok := orders[sort]; ok {
		return order
	}
	return orders["name"]
}

func (o entryOrder) SQL() string { return o.column + " " + o.direction + " NULLS LAST" }

// 绑定用户与实际SQL条件，旧视图修改规则/排序后不能误用上一份游标。
func cursorScope(where string, args []any, order entryOrder) string {
	encoded, _ := json.Marshal([]any{where, args, order.SQL()})
	sum := sha256.Sum256(encoded)
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func (o entryOrder) after(token, scope string) (string, []any, error) {
	if len(token) > 4096 {
		return "", nil, ErrInvalid
	}
	encoded, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", nil, ErrInvalid
	}
	var c entryCursor
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&c) != nil || decoder.Decode(new(any)) != io.EOF || c.ID <= 0 || c.Scope != scope {
		return "", nil, ErrInvalid
	}
	var value any = c.Value
	switch o.kind {
	case "size":
		n, err := strconv.ParseInt(c.Value, 10, 64)
		if err != nil || n < 0 {
			return "", nil, ErrInvalid
		}
		value = n
	case "date", "created", "opened":
		if !c.Null {
			at, err := time.Parse(time.RFC3339Nano, c.Value)
			if err != nil {
				return "", nil, ErrInvalid
			}
			value = at
		}
	case "name":
		if len(c.Value) > 1024 {
			return "", nil, ErrInvalid
		}
	}
	if c.Null && o.kind != "opened" {
		return "", nil, ErrInvalid
	}
	comparison := "<"
	if o.direction == "ASC" {
		comparison = ">"
	}
	key := o.column + " " + comparison + " ? OR (" + o.column + " = ? AND e.id < ?)"
	values := []any{value, value, c.ID}
	if o.kind == "opened" {
		if c.Null {
			key = o.column + " IS NULL AND e.id < ?"
			values = []any{c.ID}
		} else {
			key += " OR " + o.column + " IS NULL"
		}
	}
	return "((e.kind='folder') < ? OR ((e.kind='folder') = ? AND (" + key + ")))", append([]any{c.Folder, c.Folder}, values...), nil
}

func (o entryOrder) cursor(e Entry, scope string) string {
	c := entryCursor{Scope: scope, ID: e.ID, Folder: e.Kind == "folder"}
	switch o.kind {
	case "name":
		c.Value = e.NormalizedName
	case "size":
		c.Value = fmt.Sprint(e.Size)
	case "date":
		c.Value = e.UpdatedAt.Format(time.RFC3339Nano)
	case "created":
		c.Value = e.CreatedAt.Format(time.RFC3339Nano)
	case "opened":
		c.Null = e.LastOpenedAt == nil
		if !c.Null {
			c.Value = e.LastOpenedAt.Format(time.RFC3339Nano)
		}
	}
	encoded, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(encoded)
}
