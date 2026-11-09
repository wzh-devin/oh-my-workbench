package auth

import authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"

type CachedSession struct {
	authresp.UserResponse
	Version int64 `json:"version"`
}
