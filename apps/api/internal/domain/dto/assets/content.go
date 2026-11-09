package assets

import (
	"io"
	"time"

	s3dto "github.com/devin/oh-my-workbench/api/internal/domain/dto/s3"
)

type Content struct {
	Reader            io.ReadSeekCloser
	Name, Type, ETag  string
	Size              int64
	ModifiedAt        time.Time
	ConnectionID      int64        `json:"-"`
	ConnectionVersion int          `json:"-"`
	PublicEndpoint    string       `json:"-"`
	Storage           s3dto.Config `json:"-"`
	ObjectKey         string
	ObjectVersionID   string
}

type ContentAccess struct {
	URL       string     `json:"url"`
	ExpiresAt *time.Time `json:"expiresAt"`
	CacheKey  string     `json:"cacheKey"`
}
