package service

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"net/mail"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/net/proxy"

	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
	mailrepo "github.com/devin/oh-my-workbench/api/internal/modules/mail/repository"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
)

// 邮箱参数校验与业务编排，不直接访问数据库。
// 系统配置提供稳定密钥与共享传输；邮箱输入不能控制服务端点。
type Options struct {
	EncryptionKey   string
	Dialer          proxy.ContextDialer
	Routes          *outbound.Routes
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
	PushSubject     func(context.Context) (string, error)
}

type Service struct {
	repository         *mailrepo.Repository
	cipher             *credentialCipher
	options            Options
	routes             *outbound.Routes
	bodyRefresh        chan maildomain.Record
	bodyRefreshPending sync.Map
}

func NewService(repository *mailrepo.Repository, options Options) (*Service, error) {
	dialer := options.Dialer
	if dialer == nil {
		dialer = &net.Dialer{Timeout: 15 * time.Second, KeepAlive: 30 * time.Second}
	}
	cipher, err := newCredentialCipher(options.EncryptionKey)
	if err != nil {
		return nil, err
	}
	if options.VAPIDPublicKey != "" || options.VAPIDPrivateKey != "" {
		public, e1 := base64.RawURLEncoding.DecodeString(options.VAPIDPublicKey)
		private, e2 := base64.RawURLEncoding.DecodeString(options.VAPIDPrivateKey)
		key, e3 := ecdh.P256().NewPrivateKey(private)
		if e1 != nil || e2 != nil || e3 != nil || key == nil || !bytes.Equal(key.PublicKey().Bytes(), public) {
			return nil, fmt.Errorf("系统推送密钥不匹配，请检查系统配置")
		}
		if options.VAPIDSubject != "" || options.PushSubject == nil {
			subject, err := url.Parse(options.VAPIDSubject)
			if err != nil || subject == nil || (subject.Scheme != "mailto" && subject.Scheme != "https") {
				return nil, fmt.Errorf("推送联系地址必须为 mailto: 或 HTTPS 地址")
			}
		}
	}
	routes := options.Routes
	if routes == nil {
		routes = outbound.NewRoutes(nil, dialer)
	}
	return &Service{repository: repository, cipher: cipher, options: options, routes: routes, bodyRefresh: make(chan maildomain.Record, 32)}, nil
}

func (s *Service) Accounts(ctx context.Context, userID int64) ([]maildomain.AccountView, error) {
	records, err := s.repository.AccountViews(ctx, userID)
	for i := range records {
		s.decorateAccount(&records[i])
	}
	return records, err
}

func (s *Service) decorateAccount(a *maildomain.AccountView) {
	a.Host = providerHosts[a.Provider]
	a.Port = 993
	a.TLS = true
	a.Status = "connected"
	if a.LastError != nil {
		a.Status = "error"
	}
	if !a.Enabled {
		a.Status = "paused"
	}
}

// SaveAccount tests only newly supplied credentials; pausing never requires an IMAP connection.
func (s *Service) SaveAccount(ctx context.Context, userID, id int64, input maildomain.AccountInput) (maildomain.AccountView, error) {
	if s.cipher == nil {
		return maildomain.AccountView{}, maildomain.ErrDisabled
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || strings.ContainsAny(input.Name, "\x00\r\n") {
		return maildomain.AccountView{}, maildomain.ErrInvalid
	}
	var a maildomain.Account
	var err error
	create := id == 0
	if create {
		address, e := mail.ParseAddress(strings.TrimSpace(input.Email))
		if e != nil || address.Address != strings.TrimSpace(input.Email) || len(address.Address) > 320 || providerHosts[input.Provider] == "" {
			return maildomain.AccountView{}, maildomain.ErrInvalid
		}
		a = maildomain.Account{Record: maildomain.NewRecord(userID), Name: input.Name, Provider: input.Provider, Email: strings.ToLower(address.Address), Enabled: true, NotifyEnabled: true, Version: 1}
		if input.Credential == "" {
			return maildomain.AccountView{}, maildomain.ErrInvalid
		}
	} else {
		a, err = s.repository.Account(ctx, userID, id)
		if err != nil {
			return maildomain.AccountView{}, err
		}
		if input.Version != a.Version {
			return maildomain.AccountView{}, maildomain.ErrConflict
		}
		if input.Email != "" && !strings.EqualFold(input.Email, a.Email) || input.Provider != "" && input.Provider != a.Provider {
			return maildomain.AccountView{}, maildomain.ErrInvalid
		}
	}
	a.Name = input.Name
	if input.Enabled != nil {
		a.Enabled = *input.Enabled
	}
	if input.NotifyEnabled != nil {
		a.NotifyEnabled = *input.NotifyEnabled
	}
	if input.Credential != "" {
		if len(input.Credential) > 512 || strings.ContainsAny(input.Credential, "\x00\r\n") {
			return maildomain.AccountView{}, maildomain.ErrInvalid
		}
		allowed, err := s.repository.AllowConnection(ctx, userID)
		if err != nil {
			return maildomain.AccountView{}, err
		}
		if !allowed {
			return maildomain.AccountView{}, fmt.Errorf("%w：验证过于频繁，请稍后重试", maildomain.ErrInvalid)
		}
		secret := input.Credential
		if a.Provider == "Gmail" {
			secret = strings.ReplaceAll(secret, " ", "")
		}
		session, err := s.connectMailbox(ctx, a, secret)
		if err != nil {
			return maildomain.AccountView{}, err
		}
		_, _, err = session.selectInbox()
		session.close()
		if err != nil {
			return maildomain.AccountView{}, err
		}
		a.CredentialCiphertext = s.cipher.encrypt(a.ID, secret)
	}
	if err = s.repository.SaveAccount(ctx, a, create); err != nil {
		return maildomain.AccountView{}, err
	}
	if a.Enabled {
		if _, err = s.repository.Enqueue(ctx, userID, a.ID, "manual"); err != nil {
			return maildomain.AccountView{}, err
		}
	}
	records, err := s.Accounts(ctx, userID)
	if err != nil {
		return maildomain.AccountView{}, err
	}
	s.repository.Changed(ctx, userID)
	for _, record := range records {
		if record.ID == a.ID {
			return record, nil
		}
	}
	return maildomain.AccountView{}, maildomain.ErrNotFound
}

func (s *Service) Query(ctx context.Context, userID int64, input maildomain.QueryInput) (maildomain.QueryResult, error) {
	if input.Page < 1 {
		input.Page = 1
	}
	if input.PageSize == 0 {
		input.PageSize = 10
	}
	if input.Page > 100000 || input.PageSize < 1 || input.PageSize > 100 || utf8.RuneCountInString(input.SearchText) > 200 || input.Sort != "" && input.Sort != "newest" && input.Sort != "oldest" && input.Sort != "subject" {
		return maildomain.QueryResult{}, maildomain.ErrInvalid
	}
	if input.AfterID != "" {
		if _, err := maildomain.ParseID(input.AfterID); err != nil {
			return maildomain.QueryResult{}, err
		}
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input)
	if err != nil {
		return maildomain.QueryResult{}, err
	}
	return s.repository.Query(ctx, userID, accountID, input, predicate)
}

// queryScope 统一用户边界和规则校验；批量接口同样不能绕过。
func (s *Service) queryScope(ctx context.Context, userID int64, input maildomain.QueryInput) (int64, mailrepo.MessagePredicate, error) {
	if utf8.RuneCountInString(input.SearchText) > 200 {
		return 0, nil, maildomain.ErrInvalid
	}
	accountID := int64(0)
	if input.AccountID != "" && input.AccountID != "all" {
		var err error
		accountID, err = maildomain.ParseID(input.AccountID)
		if err != nil {
			return 0, nil, err
		}
		if _, err = s.repository.Account(ctx, userID, accountID); err != nil {
			return 0, nil, err
		}
	}
	predicate, err := mailrepo.QueryPredicate(input.FilterQuery)
	if err != nil {
		return 0, nil, err
	}
	return accountID, predicate, nil
}

// bulkMessages 仅修改工作台状态，不写回远端邮箱或删除邮件。
func (s *Service) BulkMessages(ctx context.Context, userID int64, input maildomain.BulkInput) (maildomain.BulkResult, error) {
	if input.Action != "read" && input.Action != "archive-read" {
		return maildomain.BulkResult{}, maildomain.ErrInvalid
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input.QueryInput)
	if err != nil {
		return maildomain.BulkResult{}, err
	}
	result, err := s.repository.BulkMessages(ctx, userID, accountID, input, predicate)
	if err == nil && result.Affected > 0 {
		s.repository.Changed(ctx, userID)
	}
	return result, err
}

func (s *Service) Overview(ctx context.Context, userID int64) (maildomain.Overview, error) {
	out, err := s.repository.Overview(ctx, userID)
	for i := range out.Accounts {
		s.decorateAccount(&out.Accounts[i])
	}
	return out, err
}

// openMessage 命中任何版本的正文缓存都立即返回；旧格式升级不阻塞阅读。
func (s *Service) OpenMessage(ctx context.Context, userID, id int64) (maildomain.MessageView, error) {
	view, err := s.repository.Message(ctx, userID, id)
	if err != nil {
		return view, err
	}
	if view.BodyFetchedAt != nil {
		if view.BodyFormatVersion < maildomain.BodyFormatVersion && s.cipher != nil {
			s.queueBodyRefresh(view.Record)
		}
		return view, nil
	}
	body, err := s.fetchBody(ctx, userID, view.Message)
	if err != nil {
		return view, err
	}
	if err = s.repository.CacheBody(ctx, userID, id, body); err != nil {
		return view, err
	}
	view.BodyText = &body.Text
	view.BodyHTML = body.HTML
	view.Preview = maildomain.Preview(body.Text)
	return view, nil
}

// fetchBody 只负责远端读取；缓存更新与失败降级由调用方决定。
func (s *Service) fetchBody(ctx context.Context, userID int64, message maildomain.Message) (maildomain.MessageBody, error) {
	a, err := s.repository.Account(ctx, userID, message.AccountID)
	if err != nil {
		return maildomain.MessageBody{}, err
	}
	secret, err := s.cipher.decrypt(a)
	if err != nil {
		return maildomain.MessageBody{}, err
	}
	session, err := s.connectMailbox(ctx, a, secret)
	if err != nil {
		return maildomain.MessageBody{}, err
	}
	defer session.close()
	if err = validateRemote(session, message); err != nil {
		return maildomain.MessageBody{}, err
	}
	return session.body(message.RemoteUID)
}

// download resolves the part from owned database rows, never from a client-supplied IMAP path.
func (s *Service) Download(ctx context.Context, userID, id int64, consume func(maildomain.Attachment, io.Reader) error) error {
	attachment, err := s.repository.Attachment(ctx, userID, id)
	if err != nil {
		return err
	}
	view, err := s.repository.Message(ctx, userID, attachment.MessageID)
	if err != nil {
		return err
	}
	a, err := s.repository.Account(ctx, userID, view.AccountID)
	if err != nil {
		return err
	}
	secret, err := s.cipher.decrypt(a)
	if err != nil {
		return err
	}
	session, err := s.connectMailbox(ctx, a, secret)
	if err != nil {
		return err
	}
	defer session.close()
	if err = validateRemote(session, view.Message); err != nil {
		return err
	}
	return session.streamPart(view.RemoteUID, attachment.PartID, attachment.Encoding, func(reader io.Reader) error { return consume(attachment, reader) })
}

func randomToken() string {
	var value [24]byte
	if _, err := rand.Read(value[:]); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(value[:])
}
