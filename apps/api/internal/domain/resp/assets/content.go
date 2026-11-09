package assets

import "time"

type ContentAccessResponse struct {
	URL       string     `json:"url"`
	ExpiresAt *time.Time `json:"expiresAt"`
	CacheKey  string     `json:"cacheKey"`
}
