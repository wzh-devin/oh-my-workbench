package service

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

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	minio "github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

const contentAccessLifetime = 15 * time.Minute

// AccessContent 复用内容授权及安全校验；链接绑定最终公开主机和不可变对象版本。
func (s *Service) AccessContent(ctx context.Context, userID, id int64, preview, download bool) (assetdomain.ContentAccess, error) {
	content, err := s.OpenContent(ctx, userID, id, preview, download)
	if err != nil {
		return assetdomain.ContentAccess{}, err
	}
	defer content.Reader.Close()
	c := content.connection
	if c.PublicEndpoint == "" {
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
		return assetdomain.ContentAccess{URL: path}, nil
	}
	u, err := endpointURL(c.PublicEndpoint)
	if err != nil || !validStorageEndpoint(u) {
		return assetdomain.ContentAccess{}, assetdomain.ErrEndpoint
	}
	access, secret, err := s.credentials(c)
	if err != nil {
		return assetdomain.ContentAccess{}, err
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(access, secret, ""), Secure: u.Scheme == "https", Region: region, BucketLookup: bucketLookup(c)})
	if err != nil {
		return assetdomain.ContentAccess{}, err
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
	if content.objectVersionID != "" {
		params.Set("versionId", content.objectVersionID)
	}
	signed, err := client.PresignedGetObject(ctx, c.Bucket, content.objectKey, contentAccessLifetime, params)
	if err != nil {
		return assetdomain.ContentAccess{}, err
	}
	// 最近访问会更新Entry.Version；缓存仅随对象、名称或连接配置变化，避免每次打开失效。
	identity, _ := json.Marshal([]any{c.ID, c.Version, content.objectKey, content.objectVersionID, content.ETag, content.Name, content.Type, download})
	digest := sha256.Sum256(identity)
	return assetdomain.ContentAccess{URL: signed.String(), ExpiresAt: &expiresAt, CacheKey: hex.EncodeToString(digest[:])}, nil
}
