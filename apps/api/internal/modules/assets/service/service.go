package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/net/proxy"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	assetrepo "github.com/devin/oh-my-workbench/api/internal/modules/assets/repository"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/shared/credentialkey"
)

// Service 只编排边界校验和对象存储操作，持久化访问统一由 Repository 承担。
var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

var bucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

type Options struct {
	EncryptionKey, ConverterURL string
	Dialer                      proxy.ContextDialer
	Routes                      *outbound.Routes
	ConverterAddress            func(context.Context) (string, error)
}

type Service struct {
	repo             *assetrepo.Repository
	cipher           cipher.AEAD
	converterURL     string
	converterAddress func(context.Context) (string, error)
	dialer           proxy.ContextDialer
	objectTransport  *http.Transport
	converterClient  *http.Client
	routes           *outbound.Routes
	thumbnailCursor  int64 // 仅旧文件补齐协程读写；当前页入队不依赖此游标。
}

func NewService(repo *assetrepo.Repository, options Options) (*Service, error) {
	s := &Service{repo: repo, converterURL: strings.TrimRight(options.ConverterURL, "/"), converterAddress: options.ConverterAddress}
	s.dialer = options.Dialer
	if s.dialer == nil {
		s.dialer = &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	}
	s.objectTransport = http.DefaultTransport.(*http.Transport).Clone()
	s.objectTransport.Proxy = nil
	s.objectTransport.DialContext = s.dialStorage
	s.objectTransport.ResponseHeaderTimeout = 30 * time.Second
	s.objectTransport.MaxIdleConnsPerHost = 16
	converterTransport := http.DefaultTransport.(*http.Transport).Clone()
	converterTransport.Proxy = nil
	converterTransport.DialContext = s.dialer.DialContext
	s.converterClient = &http.Client{Transport: converterTransport, Timeout: 60 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	s.routes = options.Routes
	if s.routes == nil {
		s.routes = outbound.NewRoutes(nil, s.dialer)
	}
	key, err := credentialkey.Decode(options.EncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("工作台凭证密钥初始化失败: %w", err)
	}
	if len(key) != 0 {
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, err
		}
		s.cipher, err = cipher.NewGCM(block)
		if err != nil {
			return nil, err
		}
	}
	if s.converterURL == "" {
		s.converterURL = "http://127.0.0.1:13039"
	}
	if s.converterURL != "" {
		if _, err := endpointURL(s.converterURL); err != nil {
			return nil, fmt.Errorf("Office 转换服务地址无效: %w", err)
		}
	}
	return s, nil
}

func (s *Service) converterBase(ctx context.Context) (string, error) {
	if s.converterAddress != nil {
		return s.converterAddress(ctx)
	}
	return s.converterURL, nil
}

func validPrefix(value string) bool {
	if !assetdomain.ValidText(value, 200) || strings.Trim(value, "/") != value {
		return false
	}
	for _, segment := range strings.Split(value, "/") {
		if !assetdomain.ValidName(segment) {
			return false
		}
	}
	return true
}

func endpointURL(value string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(value, "/"))
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return nil, assetdomain.ErrInvalid
	}
	u.Host = strings.ToLower(u.Host)
	return u, nil
}

func (s *Service) SaveConnection(ctx context.Context, userID, id int64, input assetdomain.ConnectionInput) (assetdomain.Connection, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.PublicEndpoint = strings.TrimSpace(input.PublicEndpoint)
	if input.AddressingStyle == "" {
		input.AddressingStyle = "path"
	}
	if input.AddressingStyle != "path" && input.AddressingStyle != "virtual" {
		return assetdomain.Connection{}, assetdomain.ErrInvalid
	}
	if input.PublicEndpoint != "" {
		publicURL, err := endpointURL(input.PublicEndpoint)
		if err != nil || !validStorageEndpoint(publicURL) {
			return assetdomain.Connection{}, assetdomain.ErrEndpoint
		}
		input.PublicEndpoint = publicURL.String()
	}
	u, err := endpointURL(input.Endpoint)
	if err != nil || !assetdomain.ValidText(input.Name, 100) || !bucketPattern.MatchString(input.Bucket) || strings.Contains(input.Bucket, "..") || len(input.Region) > 64 || !validPrefix(input.Prefix) {
		return assetdomain.Connection{}, assetdomain.ErrInvalid
	}
	if s.cipher == nil {
		return assetdomain.Connection{}, assetdomain.ErrDisabled
	}
	if !validStorageEndpoint(u) {
		return assetdomain.Connection{}, assetdomain.ErrEndpoint
	}
	var saved assetdomain.Connection
	err = s.repo.Write(ctx, userID, func(r *assetrepo.Repository) error {
		c := assetdomain.Connection{Base: assetdomain.NewBase(userID), Version: 1, Enabled: input.Enabled}
		if id != 0 {
			var err error
			c, err = r.FindConnection(userID, id)
			if err != nil {
				return err
			}
			if input.Version != c.Version {
				return assetdomain.ErrConflict
			}
			if c.Endpoint != u.String() || c.Bucket != input.Bucket || c.Prefix != input.Prefix || c.Region != input.Region {
				used, err := r.ConnectionUsed(userID, id)
				if err != nil {
					return err
				}
				if used {
					return fmt.Errorf("%w：已有内容时不能改变对象定位", assetdomain.ErrConflict)
				}
			}
			c.Version++
		}
		c.Name = input.Name
		c.Endpoint = u.String()
		c.PublicEndpoint = input.PublicEndpoint
		c.AddressingStyle = input.AddressingStyle
		c.Region = input.Region
		c.Bucket = input.Bucket
		c.Prefix = input.Prefix
		c.Enabled = input.Enabled
		c.UpdatedAt = time.Now().UTC()
		if input.AccessKey != "" || input.SecretKey != "" {
			if !assetdomain.ValidText(input.AccessKey, 256) || !assetdomain.ValidText(input.SecretKey, 512) {
				return assetdomain.ErrInvalid
			}
			c.CredentialCiphertext, err = s.encrypt(c, input.AccessKey, input.SecretKey)
			if err != nil {
				return err
			}
			c.LastCheckedAt = nil
			c.LastError = ""
		} else if id == 0 {
			return assetdomain.ErrInvalid
		}
		if err := r.SaveConnection(&c); err != nil {
			return err
		}
		saved = assetdomain.ConnectionView(c)
		return nil
	})
	return saved, err
}

// 以下入口保持 HTTP 层与持久化层隔离，事务内不变量仍由 Repository 复核。
func (s *Service) Entry(ctx context.Context, userID int64, id string) (assetdomain.Entry, error) {
	return s.repo.LegacyEntry(ctx, userID, id)
}

func (s *Service) Views(ctx context.Context, userID int64) ([]assetdomain.View, error) {
	return s.repo.Views(ctx, userID)
}

func (s *Service) DeleteView(ctx context.Context, userID, id int64, version int) error {
	if version < 1 {
		return assetdomain.ErrInvalid
	}
	return s.repo.DeleteView(ctx, userID, id, version)
}

func (s *Service) Uploads(ctx context.Context, userID int64) ([]assetdomain.Upload, error) {
	return s.repo.Uploads(ctx, userID)
}

func (s *Service) LookupUpload(ctx context.Context, userID int64, key string) ([]assetdomain.Upload, error) {
	return s.repo.LookupUpload(ctx, userID, key)
}

func (s *Service) ControlUpload(ctx context.Context, userID, id int64, status string, version int) (assetdomain.Upload, error) {
	if status != "cleaning" && (version < 1 || !assetrepo.Contains([]string{"paused", "uploading"}, status)) {
		return assetdomain.Upload{}, assetdomain.ErrInvalid
	}
	return s.repo.ControlUpload(ctx, userID, id, status, version)
}

func (s *Service) CompleteUpload(ctx context.Context, userID, id int64) (assetdomain.Upload, error) {
	return s.repo.CompleteRequest(ctx, userID, id)
}

func (s *Service) Operation(ctx context.Context, userID, id int64) (assetdomain.Operation, error) {
	return s.repo.Operation(ctx, userID, id)
}

func (s *Service) ImportMetadata(ctx context.Context, userID int64, input []assetdomain.ImportEntry) error {
	return s.repo.ImportMetadata(ctx, userID, input)
}

func (s *Service) TestConnection(ctx context.Context, userID, id int64) (assetdomain.Connection, error) {
	c, err := s.repo.Connection(ctx, userID, id)
	if err != nil {
		return c, err
	}
	client, err := s.storage(ctx, c)
	if err != nil {
		err = connectionCheckError("读取连接配置", err)
	}
	if err == nil {
		var probe assetdomain.Blob
		probe, err = s.repo.ProbeBlob(ctx, c)
		if err == nil {
			job, cancel := context.WithTimeout(ctx, 2*time.Minute)
			err = client.test(job, c, probe.ObjectKey)
			cancel()
			// 请求取消也必须记录清理结果；租约为进程崩溃保留恢复入口。
			cleanupCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
			cleanupErr := client.deleteKey(cleanupCtx, c, probe.ObjectKey)
			message := ""
			if cleanupErr != nil {
				message = "探测对象清理失败，将自动重试"
			}
			saveErr := s.repo.FinishBlob(cleanupCtx, probe, message)
			stop()
			if err == nil {
				err = connectionCheckError("清理探测文件", cleanupErr)
			}
			if err == nil {
				err = saveErr
			}
		}
	}
	message := ""
	if err != nil {
		message = err.Error()
	}
	saved, saveErr := s.repo.CheckedConnection(ctx, userID, id, c.Version, message)
	if saveErr != nil {
		return saved, saveErr
	}
	if err != nil {
		return saved, err
	}
	return saved, nil
}

func (s *Service) Overview(ctx context.Context, userID int64) (assetdomain.Overview, error) {
	if err := s.repo.EnsureViews(ctx, userID); err != nil {
		return assetdomain.Overview{}, err
	}
	return s.repo.Overview(ctx, userID)
}

func (s *Service) Query(ctx context.Context, userID int64, input assetdomain.QueryInput) (assetdomain.QueryResult, error) {
	if input.Page < 0 || input.PageSize < 1 || input.PageSize > 200 || utf8.RuneCountInString(input.Search) > 200 {
		return assetdomain.QueryResult{}, assetdomain.ErrInvalid
	}
	if !assetdomain.ValidSort(input.Sort) && input.Sort != "" {
		return assetdomain.QueryResult{}, assetdomain.ErrInvalid
	}
	if len(input.FilterQuery) == 0 {
		input.FilterQuery = json.RawMessage(assetdomain.AlwaysRule)
	}
	if _, _, err := assetrepo.RuleSQL(input.FilterQuery); err != nil {
		return assetdomain.QueryResult{}, err
	}
	result, err := s.repo.Query(ctx, userID, input)
	if err == nil && !input.Trash {
		err = s.repo.QueueThumbnails(ctx, userID, result.Entries, true)
	}
	return result, err
}

func (s *Service) SaveEntry(ctx context.Context, userID, id int64, input assetdomain.EntryInput) (assetdomain.Entry, error) {
	if input.Name != nil && !assetdomain.ValidName(*input.Name) {
		return assetdomain.Entry{}, assetdomain.ErrInvalid
	}
	if input.LegacyID != nil && !assetdomain.ValidText(*input.LegacyID, 100) {
		return assetdomain.Entry{}, assetdomain.ErrInvalid
	}
	return s.repo.SaveEntry(ctx, userID, id, input)
}

func (s *Service) Batch(ctx context.Context, userID int64, input assetdomain.BatchInput) (assetdomain.Operation, error) {
	if len(input.Entries) == 0 || len(input.Entries) > 200 || !assetdomain.ValidText(input.RequestKey, 64) {
		return assetdomain.Operation{}, assetdomain.ErrInvalid
	}
	seen := map[int64]bool{}
	for _, entry := range input.Entries {
		id, err := assetdomain.ParseID(entry.ID)
		if err != nil || entry.Version < 1 || seen[id] {
			return assetdomain.Operation{}, assetdomain.ErrInvalid
		}
		seen[id] = true
	}
	switch input.Action {
	case "move", "copy", "trash", "restore", "delete", "star":
	default:
		return assetdomain.Operation{}, assetdomain.ErrInvalid
	}
	return s.repo.Batch(ctx, userID, input)
}

func (s *Service) SaveView(ctx context.Context, userID, id int64, input assetdomain.ViewInput) (assetdomain.View, error) {
	input.Name = strings.TrimSpace(input.Name)
	if !assetdomain.ValidText(strings.TrimSpace(input.Name), 100) || !viewIcons[input.Icon] || !assetdomain.ValidSort(input.Sort) {
		return assetdomain.View{}, assetdomain.ErrInvalid
	}
	if _, _, err := assetrepo.RuleSQL(input.FilterQuery); err != nil {
		return assetdomain.View{}, err
	}
	return s.repo.SaveView(ctx, userID, id, input)
}

var viewIcons = map[string]bool{"files": true, "clock": true, "star": true, "folder": true, "image": true, "file-text": true, "hard-drive": true, "briefcase": true, "heart": true, "code": true, "tag": true}
