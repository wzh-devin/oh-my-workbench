package s3

import (
	"bytes"
	"context"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	minio "github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"golang.org/x/net/proxy"

	s3dto "github.com/devin/oh-my-workbench/api/internal/domain/dto/s3"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
)

type Client struct {
	*minio.Client
	Core minio.Core
}

type endpointTransport struct {
	origin    string
	transport http.RoundTripper
}

type Service struct {
	routes    *outbound.Routes
	transport *http.Transport
}

func NewService(routes *outbound.Routes, dialer proxy.ContextDialer) *Service {
	if dialer == nil {
		dialer = &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	}
	if routes == nil {
		routes = outbound.NewRoutes(nil, dialer)
	}
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	t.ResponseHeaderTimeout = 30 * time.Second
	t.MaxIdleConnsPerHost = 16
	return &Service{routes: routes, transport: t}
}

func (s *Service) Client(ctx context.Context, userID int64, c s3dto.Config) (*Client, error) {
	u, err := EndpointURL(c.Endpoint)
	if err != nil || !ValidEndpoint(u) {
		return nil, ErrEndpoint
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}
	transport, err := s.routes.Client(ctx, userID, outbound.Storage, func(dialer proxy.ContextDialer) *http.Client {
		t := s.transport.Clone()
		t.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
			return dialStorage(ctx, dialer, network, address)
		}
		return &http.Client{Transport: t}
	})
	if err != nil {
		return nil, err
	}
	pinned := &endpointTransport{transport: transport.Transport}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""), Secure: u.Scheme == "https", Region: region, BucketLookup: BucketLookup(c.AddressingStyle), Transport: pinned})
	if err != nil {
		return nil, err
	}
	pinned.origin, err = storageOrigin(ctx, client, c.Bucket)
	if err != nil {
		return nil, err
	}
	return &Client{Client: client, Core: minio.Core{Client: client}}, nil
}

func SigningClient(c s3dto.Config) (*minio.Client, error) {
	u, err := EndpointURL(c.Endpoint)
	if err != nil || !ValidEndpoint(u) {
		return nil, ErrEndpoint
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}
	return minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""), Secure: u.Scheme == "https", Region: region, BucketLookup: BucketLookup(c.AddressingStyle)})
}

func BucketLookup(addressingStyle string) minio.BucketLookupType {
	if addressingStyle == "virtual" {
		return minio.BucketLookupDNS
	}
	return minio.BucketLookupPath
}

// 让SDK规范化区域与Bucket主机；请求仍只能到该精确源，不允许任意同后缀主机。
func storageOrigin(ctx context.Context, client *minio.Client, bucket string) (string, error) {
	link, err := client.PresignedHeadObject(ctx, bucket, ".workbench-origin", time.Second, nil)
	if err != nil {
		return "", err
	}
	return link.Scheme + "://" + strings.ToLower(link.Host), nil
}

func (t endpointTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme+"://"+strings.ToLower(request.URL.Host) != t.origin {
		return nil, ErrEndpoint
	}
	return t.transport.RoundTrip(request)
}

func (s *Client) Test(ctx context.Context, bucket, key string) error {
	exists, err := s.BucketExists(ctx, bucket)
	if err != nil {
		return stageError("检查 Bucket", err)
	}
	if !exists {
		return stageError("检查 Bucket", ErrNotFound)
	}
	// 使用独立探测对象，绝不更改已有文件或 Bucket 策略。
	content := []byte("workbench storage probe")
	info, err := s.PutObject(ctx, bucket, key, bytes.NewReader(content), int64(len(content)), minio.PutObjectOptions{ContentType: "application/octet-stream", DisableMultipart: true})
	if err != nil {
		return stageError("写入探测文件", err)
	}
	object, readErr := s.GetObject(ctx, bucket, key, minio.GetObjectOptions{VersionID: info.VersionID})
	if readErr == nil {
		actual, err := io.ReadAll(io.LimitReader(object, 1024))
		readErr = err
		if readErr == nil && !bytes.Equal(actual, content) {
			readErr = ErrInvalid
		}
		_ = object.Close()
	}
	return stageError("读取探测文件", readErr)
}

func (s *Client) Parts(ctx context.Context, bucket, key, uploadID string) (map[int]minio.ObjectPart, error) {
	parts := map[int]minio.ObjectPart{}
	marker := 0
	for {
		result, err := s.Core.ListObjectParts(ctx, bucket, key, uploadID, marker, 1000)
		if err != nil {
			return nil, err
		}
		for _, part := range result.ObjectParts {
			part.ETag = strings.Trim(part.ETag, `"`)
			parts[part.PartNumber] = part
		}
		if !result.IsTruncated {
			break
		}
		if result.NextPartNumberMarker <= marker {
			return nil, ErrConflict
		}
		marker = result.NextPartNumberMarker
	}
	return parts, nil
}

func (s *Client) Initialize(ctx context.Context, bucket, key string) (string, error) {
	// 初始化响应丢失后按专用 Key 找回会话，避免重启遗留无定位的 Multipart Upload。
	result, err := s.Core.ListMultipartUploads(ctx, bucket, key, "", "", "", 1000)
	if err != nil {
		return "", err
	}
	for _, u := range result.Uploads {
		if u.Key == key {
			return u.UploadID, nil
		}
	}
	return s.Core.NewMultipartUpload(ctx, bucket, key, minio.PutObjectOptions{ContentType: "application/octet-stream"})
}

// S3元数据更新需要服务端复制；指定已校验的源版本，字节不经过API重新上传。
func (s *Client) ContentMetadata(ctx context.Context, bucket, key string, info minio.ObjectInfo, contentType string) (minio.ObjectInfo, error) {
	if info.ContentType == contentType {
		return info, nil
	}
	metadata := make(map[string]string, len(info.UserMetadata)+1)
	for key, value := range info.UserMetadata {
		metadata[key] = value
	}
	// ComposeObject的大文件分片初始化从UserMetadata读取标准头。
	metadata["Content-Type"] = contentType
	destination := minio.CopyDestOptions{Bucket: bucket, Object: key, ContentType: contentType, ReplaceMetadata: true, UserMetadata: metadata, NumThreads: 1}
	source := minio.CopySrcOptions{Bucket: bucket, Object: key, VersionID: info.VersionID, MatchETag: info.ETag}
	var copy minio.UploadInfo
	var err error
	if info.Size <= 5<<30 {
		copy, err = s.CopyObject(ctx, destination, source)
	} else {
		copy, err = s.ComposeObject(ctx, destination, source)
	}
	if err != nil {
		return info, err
	}
	info.VersionID, info.ETag, info.ContentType = copy.VersionID, copy.ETag, contentType
	return info, nil
}

func ObjectMissing(err error) bool {
	code := minio.ToErrorResponse(err).Code
	return code == "NoSuchKey" || code == "NoSuchObject" || code == "NoSuchVersion" || code == "NoSuchUpload"
}

// 终止该Key未完成的分片会话，覆盖转换写入失败后的服务端残留。
func (client *Client) AbortKey(ctx context.Context, bucket, key string) error {
	for {
		result, err := client.Core.ListMultipartUploads(ctx, bucket, key, "", "", "", 1000)
		if err != nil {
			return err
		}
		found := false
		for _, part := range result.Uploads {
			if part.Key == key {
				found = true
				if err = client.Core.AbortMultipartUpload(ctx, bucket, key, part.UploadID); err != nil && !ObjectMissing(err) {
					return err
				}
			}
		}
		if !found {
			return nil
		}
	}
}

func (client *Client) DeleteKey(ctx context.Context, bucket, key string) error {
	if err := client.AbortKey(ctx, bucket, key); err != nil {
		return err
	}
	// ListObjectVersions 同时覆盖未知的迟到版本与删除标记，始终仅删除该稳定 Key。
	for object := range client.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: key, Recursive: true, WithVersions: true}) {
		if object.Err != nil {
			return object.Err
		}
		if object.Key != key {
			continue
		}
		if err := client.RemoveObject(ctx, bucket, key, minio.RemoveObjectOptions{VersionID: object.VersionID}); err != nil && !ObjectMissing(err) {
			return err
		}
	}
	for object := range client.ListObjects(ctx, bucket, minio.ListObjectsOptions{Prefix: key, Recursive: true, WithVersions: true}) {
		if object.Err != nil {
			return object.Err
		}
		if object.Key == key {
			return ErrConflict
		}
	}
	return nil
}

func stageError(stage string, err error) error {
	if err == nil {
		return nil
	}
	return &StageError{Stage: stage, Err: err}
}
