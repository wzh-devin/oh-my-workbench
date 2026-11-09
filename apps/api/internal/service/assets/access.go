package assets

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"time"

	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	s3service "github.com/devin/oh-my-workbench/api/internal/service/s3"
)

const contentAccessLifetime = 15 * time.Minute

// AccessContent 复用内容授权及安全校验；链接绑定最终公开主机和不可变对象版本。
func (s *Service) AccessContent(ctx context.Context, userID, id int64, preview, download bool) (assetdto.ContentAccess, error) {
	content, err := s.OpenContent(ctx, userID, id, preview, download)
	if err != nil {
		return assetdto.ContentAccess{}, err
	}
	defer content.Reader.Close()
	if content.PublicEndpoint == "" {
		path := fmt.Sprintf("/api/assets/entries/%d/content", id)
		query := url.Values{}
		if preview {
			query.Set("preview", "1")
		}
		if download {
			query.Set("download", "1")
		}
		if len(query) != 0 {
			path += "?" + query.Encode()
		}
		return assetdto.ContentAccess{URL: path}, nil
	}
	config := content.Storage
	config.Endpoint = content.PublicEndpoint
	client, err := s3service.SigningClient(config)
	if err != nil {
		return assetdto.ContentAccess{}, storageError(err)
	}
	disposition := "inline"
	if download {
		disposition = "attachment"
	}
	expiresAt := time.Now().UTC().Add(contentAccessLifetime).Truncate(time.Second)
	params := url.Values{
		"response-content-type":        {content.Type},
		"response-content-disposition": {mime.FormatMediaType(disposition, map[string]string{"filename": content.Name})},
		"response-cache-control":       {"private"},
		"response-expires":             {expiresAt.Format(http.TimeFormat)},
	}
	if download {
		params.Set("response-cache-control", "no-store")
	}
	if content.ObjectVersionID != "" {
		params.Set("versionId", content.ObjectVersionID)
	}
	signed, err := client.PresignedGetObject(ctx, config.Bucket, content.ObjectKey, contentAccessLifetime, params)
	if err != nil {
		return assetdto.ContentAccess{}, err
	}
	// 最近访问会更新Entry.Version；缓存仅随对象、名称或连接配置变化，避免每次打开失效。
	identity, _ := json.Marshal([]any{content.ConnectionID, content.ConnectionVersion, content.ObjectKey, content.ObjectVersionID, content.ETag, content.Name, content.Type, download})
	digest := sha256.Sum256(identity)
	return assetdto.ContentAccess{URL: signed.String(), ExpiresAt: &expiresAt, CacheKey: hex.EncodeToString(digest[:])}, nil
}
