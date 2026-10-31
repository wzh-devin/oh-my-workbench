// 所有对象访问限定到部署允许的 Endpoint；使用稳定 Key 和具体版本，不接受客户端远程 URL。
package assets

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gabriel-vasile/mimetype"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type storage struct {
	*minio.Client
	core minio.Core
}
type endpointTransport struct {
	origin    string
	transport http.RoundTripper
}

func (t endpointTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme+"://"+strings.ToLower(request.URL.Host) != t.origin {
		return nil, ErrEndpoint
	}
	return t.transport.RoundTrip(request)
}

var objectTransport = func() *http.Transport {
	t := http.DefaultTransport.(*http.Transport).Clone()
	t.Proxy = nil
	t.DialContext = dialStorage
	t.ResponseHeaderTimeout = 30 * time.Second
	t.MaxIdleConnsPerHost = 16
	return t
}()

func (s *Service) storage(c Connection) (*storage, error) {
	u, err := endpointURL(c.Endpoint)
	if err != nil || !validStorageEndpoint(u) {
		return nil, ErrEndpoint
	}
	access, secret, err := s.credentials(c)
	if err != nil {
		return nil, err
	}
	region := c.Region
	if region == "" {
		region = "us-east-1"
	}
	client, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(access, secret, ""), Secure: u.Scheme == "https", Region: region, BucketLookup: minio.BucketLookupPath, Transport: endpointTransport{u.String(), objectTransport}})
	if err != nil {
		return nil, err
	}
	return &storage{client, minio.Core{Client: client}}, nil
}

var objectExtension = regexp.MustCompile(`^\.[a-z0-9]{1,12}$`)

func objectKey(c Connection, blobID int64, name string) string {
	extension := strings.ToLower(filepath.Ext(name))
	if !objectExtension.MatchString(extension) {
		extension = ".bin"
	}
	return path.Join(c.Prefix, formatID(c.UserID), formatID(blobID), "original"+extension)
}
func (s *storage) test(ctx context.Context, c Connection, key string) error {
	exists, err := s.BucketExists(ctx, c.Bucket)
	if err != nil {
		return connectionCheckError("检查 Bucket", err)
	}
	if !exists {
		return connectionCheckError("检查 Bucket", ErrNotFound)
	}
	// 使用独立探测对象，绝不更改已有文件或 Bucket 策略。
	content := []byte("workbench storage probe")
	info, err := s.PutObject(ctx, c.Bucket, key, bytes.NewReader(content), int64(len(content)), minio.PutObjectOptions{ContentType: "application/octet-stream", DisableMultipart: true})
	if err != nil {
		return connectionCheckError("写入探测文件", err)
	}
	object, readErr := s.GetObject(ctx, c.Bucket, key, minio.GetObjectOptions{VersionID: info.VersionID})
	if readErr == nil {
		actual, err := io.ReadAll(io.LimitReader(object, 1024))
		readErr = err
		if readErr == nil && !bytes.Equal(actual, content) {
			readErr = ErrInvalid
		}
		_ = object.Close()
	}
	return connectionCheckError("读取探测文件", readErr)
}
func (s *storage) parts(ctx context.Context, c Connection, b Blob, u Upload) (map[int]minio.ObjectPart, error) {
	parts := map[int]minio.ObjectPart{}
	marker := 0
	for {
		result, err := s.core.ListObjectParts(ctx, c.Bucket, b.ObjectKey, u.S3UploadID, marker, 1000)
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
func objectMissing(err error) bool {
	code := minio.ToErrorResponse(err).Code
	return code == "NoSuchKey" || code == "NoSuchObject" || code == "NoSuchVersion" || code == "NoSuchUpload"
}
func (s *storage) initialize(ctx context.Context, c Connection, b Blob) (string, error) {
	// 初始化响应丢失后按专用 Key 找回会话，避免重启遗留无定位的 Multipart Upload。
	result, err := s.core.ListMultipartUploads(ctx, c.Bucket, b.ObjectKey, "", "", "", 1000)
	if err != nil {
		return "", err
	}
	for _, u := range result.Uploads {
		if u.Key == b.ObjectKey {
			return u.UploadID, nil
		}
	}
	return s.core.NewMultipartUpload(ctx, c.Bucket, b.ObjectKey, minio.PutObjectOptions{ContentType: "application/octet-stream"})
}
func (s *storage) verify(ctx context.Context, c Connection, b Blob, u Upload) (minio.ObjectInfo, string, string, error) {
	info, err := s.StatObject(ctx, c.Bucket, b.ObjectKey, minio.StatObjectOptions{VersionID: b.ObjectVersionID})
	if err != nil {
		return info, "", "", err
	}
	if info.Size != u.SizeBytes {
		return info, "", "", ErrInvalid
	}
	object, err := s.GetObject(ctx, c.Bucket, b.ObjectKey, minio.GetObjectOptions{VersionID: info.VersionID})
	if err != nil {
		return info, "", "", err
	}
	defer object.Close()
	hash := sha256.New()
	head := make([]byte, 3072)
	n, err := io.ReadFull(object, head)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return info, "", "", err
	}
	_, _ = hash.Write(head[:n])
	written, err := io.Copy(hash, io.LimitReader(object, maxFileSize+1))
	if err != nil {
		return info, "", "", err
	}
	if written+int64(n) != u.SizeBytes {
		return info, "", "", ErrInvalid
	}
	digest := hex.EncodeToString(hash.Sum(nil))
	if digest != u.ExpectedSHA256 {
		return info, "", "", fmt.Errorf("%w：文件指纹与实际内容不一致", ErrInvalid)
	}
	contentType := mimetype.Detect(head[:n]).String()
	return info, digest, contentType, nil
}

// S3元数据更新需要服务端复制；指定已校验的源版本，字节不经过API重新上传。
func (s *storage) contentMetadata(ctx context.Context, c Connection, b Blob, info minio.ObjectInfo, contentType string) (minio.ObjectInfo, error) {
	if info.ContentType == contentType {
		return info, nil
	}
	metadata := make(map[string]string, len(info.UserMetadata)+1)
	for key, value := range info.UserMetadata {
		metadata[key] = value
	}
	// ComposeObject的大文件分片初始化从UserMetadata读取标准头。
	metadata["Content-Type"] = contentType
	destination := minio.CopyDestOptions{Bucket: c.Bucket, Object: b.ObjectKey, ContentType: contentType, ReplaceMetadata: true, UserMetadata: metadata, NumThreads: 1}
	source := minio.CopySrcOptions{Bucket: c.Bucket, Object: b.ObjectKey, VersionID: info.VersionID, MatchETag: info.ETag}
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
