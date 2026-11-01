package domain

import "time"

const (
	RedisKeyPrefix  = "auth"
	RedisSessionKey = RedisKeyPrefix + ":session"
	SessionDuration = 12 * time.Hour
)

// CachedSession 保留旧缓存字段；未带版本的历史会话按 0 处理。
type CachedSession struct {
	UserInfo
	Version int64 `json:"version"`
}
