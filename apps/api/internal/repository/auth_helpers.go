package repository

import (
	"crypto/sha256"
	"encoding/hex"

	redis "github.com/redis/go-redis/v9"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
)

var authRecordFailure = redis.NewScript(`local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n`)

func authSessionKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return authdomain.RedisSessionKey + ":" + hex.EncodeToString(sum[:])
}

func authFailureKey(username string) string { return "auth:failures:" + authSessionKey(username) }
