// Service 只编排边界校验和对象存储操作，持久化访问统一由 Repository 承担。
package assets

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	ErrInvalid            = errors.New("输入无效，请检查名称、目录和配置")
	ErrNotFound           = errors.New("文件、目录或存储不可用")
	ErrConflict           = errors.New("记录已变化或操作正在进行，请重载后重试")
	ErrName               = errors.New("同目录已存在同名文件或文件夹")
	ErrRule               = errors.New("视图规则无效或引用的存储不可用，请编辑视图")
	ErrDisabled           = errors.New("工作台的凭证加密尚未就绪，请联系工作台管理员")
	ErrEndpoint           = errors.New("存储地址不可用，请填写有效的 S3/MinIO 地址")
	ErrPreviewUnavailable = errors.New("Office 预览服务暂不可用，请下载原文件")
	ErrConnectionCheck    = errors.New("存储连接检查未通过")
	ErrLastView           = errors.New("至少保留一个资产视图")
)

const maxFileSize int64 = 10 << 30
const multipartThreshold int64 = 32 << 20
const partSize int64 = 8 << 20

var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var bucketPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$`)

type Options struct{ EncryptionKey, KeyFile, ConverterURL string }
type Service struct {
	repo            *Repository
	cipher          cipher.AEAD
	converterURL    string
	thumbnailCursor int64 // 仅旧文件补齐协程读写；当前页入队不依赖此游标。
}

func NewService(repo *Repository, options Options) (*Service, error) {
	s := &Service{repo: repo, converterURL: strings.TrimRight(options.ConverterURL, "/")}
	key, err := credentialKey(options.EncryptionKey, options.KeyFile)
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
func formatID(id int64) string { return strconv.FormatInt(id, 10) }
func parseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 || formatID(id) != value {
		return 0, ErrInvalid
	}
	return id, nil
}
func parentID(value *string) (*int64, error) {
	if value == nil {
		return nil, nil
	}
	id, err := parseID(*value)
	return &id, err
}
func validText(value string, max int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= max && !strings.ContainsFunc(value, unicode.IsControl)
}
func validName(value string) bool {
	return validText(value, 200) && value == strings.TrimSpace(value) && value != "." && value != ".." && !strings.ContainsAny(value, "/\\")
}

func validPrefix(value string) bool {
	if !validText(value, 200) || strings.Trim(value, "/") != value {
		return false
	}
	for _, segment := range strings.Split(value, "/") {
		if !validName(segment) {
			return false
		}
	}
	return true
}
func endpointURL(value string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(value, "/"))
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" {
		return nil, ErrInvalid
	}
	u.Host = strings.ToLower(u.Host)
	return u, nil
}
func connectionView(c Connection) Connection {
	c.Status = "error"
	if !c.Enabled {
		c.Status = "paused"
	} else if c.LastCheckedAt != nil && c.LastError == "" {
		c.Status = "connected"
	}
	return c
}

func (s *Service) SaveConnection(ctx context.Context, userID, id int64, input ConnectionInput) (Connection, error) {
	input.Name = strings.TrimSpace(input.Name)
	u, err := endpointURL(input.Endpoint)
	if err != nil || !validText(input.Name, 100) || !bucketPattern.MatchString(input.Bucket) || strings.Contains(input.Bucket, "..") || len(input.Region) > 64 || !validPrefix(input.Prefix) {
		return Connection{}, ErrInvalid
	}
	if s.cipher == nil {
		return Connection{}, ErrDisabled
	}
	if !validStorageEndpoint(u) {
		return Connection{}, ErrEndpoint
	}
	var saved Connection
	err = s.repo.Write(ctx, userID, func(r *Repository) error {
		c := Connection{Base: base(userID), Version: 1, Enabled: input.Enabled}
		if id != 0 {
			var err error
			c, err = r.connection(userID, id)
			if err != nil {
				return err
			}
			if input.Version != c.Version {
				return ErrConflict
			}
			if c.Endpoint != u.String() || c.Bucket != input.Bucket || c.Prefix != input.Prefix || c.Region != input.Region {
				used, err := r.connectionUsed(userID, id)
				if err != nil {
					return err
				}
				if used {
					return fmt.Errorf("%w：已有内容时不能改变对象定位", ErrConflict)
				}
			}
			c.Version++
		}
		c.Name = input.Name
		c.Endpoint = u.String()
		c.Region = input.Region
		c.Bucket = input.Bucket
		c.Prefix = input.Prefix
		c.Enabled = input.Enabled
		c.UpdatedAt = time.Now().UTC()
		if input.AccessKey != "" || input.SecretKey != "" {
			if !validText(input.AccessKey, 256) || !validText(input.SecretKey, 512) {
				return ErrInvalid
			}
			c.CredentialCiphertext, err = s.encrypt(c, input.AccessKey, input.SecretKey)
			if err != nil {
				return err
			}
			c.LastCheckedAt = nil
			c.LastError = ""
		} else if id == 0 {
			return ErrInvalid
		}
		if err := r.saveConnection(&c); err != nil {
			return err
		}
		saved = connectionView(c)
		return nil
	})
	return saved, err
}

// 以下入口保持 HTTP 层与持久化层隔离，事务内不变量仍由 Repository 复核。
func (s *Service) Entry(ctx context.Context, userID int64, id string) (Entry, error) {
	return s.repo.LegacyEntry(ctx, userID, id)
}
func (s *Service) Views(ctx context.Context, userID int64) ([]View, error) {
	return s.repo.Views(ctx, userID)
}
func (s *Service) DeleteView(ctx context.Context, userID, id int64, version int) error {
	if version < 1 {
		return ErrInvalid
	}
	return s.repo.DeleteView(ctx, userID, id, version)
}
func (s *Service) Uploads(ctx context.Context, userID int64) ([]Upload, error) {
	return s.repo.Uploads(ctx, userID)
}
func (s *Service) LookupUpload(ctx context.Context, userID int64, key string) ([]Upload, error) {
	return s.repo.LookupUpload(ctx, userID, key)
}
func (s *Service) ControlUpload(ctx context.Context, userID, id int64, status string, version int) (Upload, error) {
	if status != "cleaning" && (version < 1 || !contains([]string{"paused", "uploading"}, status)) {
		return Upload{}, ErrInvalid
	}
	return s.repo.ControlUpload(ctx, userID, id, status, version)
}
func (s *Service) CompleteUpload(ctx context.Context, userID, id int64) (Upload, error) {
	return s.repo.CompleteRequest(ctx, userID, id)
}
func (s *Service) Operation(ctx context.Context, userID, id int64) (Operation, error) {
	return s.repo.Operation(ctx, userID, id)
}
func (s *Service) ImportMetadata(ctx context.Context, userID int64, input []ImportEntry) error {
	return s.repo.ImportMetadata(ctx, userID, input)
}
func (s *Service) TestConnection(ctx context.Context, userID, id int64) (Connection, error) {
	c, err := s.repo.Connection(ctx, userID, id)
	if err != nil {
		return c, err
	}
	client, err := s.storage(c)
	if err != nil {
		err = connectionCheckError("读取连接配置", err)
	}
	if err == nil {
		var probe Blob
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
func (s *Service) Overview(ctx context.Context, userID int64) (Overview, error) {
	if err := s.repo.EnsureViews(ctx, userID); err != nil {
		return Overview{}, err
	}
	return s.repo.Overview(ctx, userID)
}
func (s *Service) Query(ctx context.Context, userID int64, input QueryInput) (QueryResult, error) {
	if input.Page < 0 || input.PageSize < 1 || input.PageSize > 200 || utf8.RuneCountInString(input.Search) > 200 {
		return QueryResult{}, ErrInvalid
	}
	if !validSort(input.Sort) && input.Sort != "" {
		return QueryResult{}, ErrInvalid
	}
	if len(input.FilterQuery) == 0 {
		input.FilterQuery = json.RawMessage(alwaysRule)
	}
	if _, _, err := ruleSQL(input.FilterQuery); err != nil {
		return QueryResult{}, err
	}
	result, err := s.repo.Query(ctx, userID, input)
	if err == nil && !input.Trash {
		err = s.repo.QueueThumbnails(ctx, userID, result.Entries, true)
	}
	return result, err
}
func (s *Service) SaveEntry(ctx context.Context, userID, id int64, input EntryInput) (Entry, error) {
	if input.Name != nil && !validName(*input.Name) {
		return Entry{}, ErrInvalid
	}
	if input.LegacyID != nil && !validText(*input.LegacyID, 100) {
		return Entry{}, ErrInvalid
	}
	return s.repo.SaveEntry(ctx, userID, id, input)
}
func (s *Service) Batch(ctx context.Context, userID int64, input BatchInput) (Operation, error) {
	if len(input.Entries) == 0 || len(input.Entries) > 200 || !validText(input.RequestKey, 64) {
		return Operation{}, ErrInvalid
	}
	seen := map[int64]bool{}
	for _, entry := range input.Entries {
		id, err := parseID(entry.ID)
		if err != nil || entry.Version < 1 || seen[id] {
			return Operation{}, ErrInvalid
		}
		seen[id] = true
	}
	switch input.Action {
	case "move", "copy", "trash", "restore", "delete", "star":
	default:
		return Operation{}, ErrInvalid
	}
	return s.repo.Batch(ctx, userID, input)
}
func validSort(value string) bool {
	switch value {
	case "name", "name-desc", "date", "date-asc", "size", "size-asc", "opened", "created", "created-asc":
		return true
	}
	return false
}
func (s *Service) SaveView(ctx context.Context, userID, id int64, input ViewInput) (View, error) {
	input.Name = strings.TrimSpace(input.Name)
	if !validText(strings.TrimSpace(input.Name), 100) || !viewIcons[input.Icon] || !validSort(input.Sort) {
		return View{}, ErrInvalid
	}
	if _, _, err := ruleSQL(input.FilterQuery); err != nil {
		return View{}, err
	}
	return s.repo.SaveView(ctx, userID, id, input)
}
