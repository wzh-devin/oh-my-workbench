package todos

import (
	"encoding/hex"
	"strings"
)

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
