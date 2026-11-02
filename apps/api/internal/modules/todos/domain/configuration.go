package domain

import (
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"
)

type View struct {
	Record
	BuiltinKey  *string
	Name        string
	Icon        string
	FilterQuery json.RawMessage `gorm:"type:jsonb"`
	SearchText  string          // 兼容旧客户端；新客户端将文本条件写入FilterQuery，保存时清空此字段。
	Sort        string
	Version     int
	DeletedAt   *time.Time
}

func (View) TableName() string { return "omw_todo_view" }

type Priority struct {
	Record
	Value    int
	Name     string
	Color    string
	Position int
	Version  int
}

func (Priority) TableName() string { return "omw_todo_priority" }

type ViewRequest struct {
	ID          string          `json:"id,omitempty"`
	Version     int             `json:"version"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	SearchText  string          `json:"searchText"`
	Sort        string          `json:"sort"`
}

type ViewInfo struct {
	ID          int64           `json:"id,string"`
	BuiltinKey  *string         `json:"builtinKey"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	SearchText  string          `json:"searchText"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}

type PriorityInfo struct {
	ID       int64  `json:"id,string"`
	Value    int    `json:"value"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Position int    `json:"position"`
	Version  int    `json:"version"`
}

type PriorityRequest struct {
	Value   int    `json:"value"`
	Name    string `json:"name"`
	Color   string `json:"color"`
	Version int    `json:"version"`
}

type PrioritiesRequest struct {
	Priorities []PriorityRequest `json:"priorities"`
}

func ToViewInfo(v View) ViewInfo {
	return ViewInfo{v.ID, v.BuiltinKey, v.Name, v.Icon, v.FilterQuery, v.SearchText, v.Sort, v.Version}
}

func ToPriorityInfo(p Priority) PriorityInfo {
	color, _ := NormalizePriorityColor(p.Color)
	return PriorityInfo{p.ID, p.Value, p.Name, color, p.Position, p.Version}
}

var priorityColors = map[string]string{"gray": "#71717a", "red": "#ef4444", "orange": "#f97316", "amber": "#f59e0b", "green": "#10b981", "blue": "#3b82f6", "violet": "#8b5cf6", "pink": "#ec4899"}

// 兼容已有颜色标识，新增及修改统一保存不透明的 HEX 颜色。
func NormalizePriorityColor(color string) (string, bool) {
	if legacy, ok := priorityColors[color]; ok {
		return legacy, true
	}
	if len(color) != 7 || color[0] != '#' {
		return "", false
	}
	if _, err := hex.DecodeString(color[1:]); err != nil {
		return "", false
	}
	return strings.ToLower(color), true
}
