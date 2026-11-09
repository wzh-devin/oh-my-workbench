package auth

import "time"

const (
	RedisKeyPrefix  = "auth"
	RedisSessionKey = RedisKeyPrefix + ":session"
	SessionDuration = 12 * time.Hour
)
