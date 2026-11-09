package notes

import "time"

type UnlockResponse struct {
	ExpiresAt time.Time `json:"expiresAt"`
}
