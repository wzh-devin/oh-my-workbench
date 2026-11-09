package mail

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

	maildto "github.com/devin/oh-my-workbench/api/internal/domain/dto/mail"
	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

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
	repository         *repository.Store
	cipher             *credentialCipher
	options            Options
	routes             *outbound.Routes
	bodyRefresh        chan repository.MailRecord
	bodyRefreshPending sync.Map
}

func NewService(store *repository.Store, options Options) (*Service, error) {
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
	return &Service{repository: store, cipher: cipher, options: options, routes: routes, bodyRefresh: make(chan repository.MailRecord, 32)}, nil
}

func (s *Service) Accounts(ctx context.Context, userID int64) ([]repository.MailAccountView, error) {
	records, err := s.repository.MailAccount.AccountViews(ctx, userID)
	for i := range records {
		s.decorateAccount(&records[i])
	}
	return records, err
}

func (s *Service) decorateAccount(a *repository.MailAccountView) {
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
func (s *Service) SaveAccount(ctx context.Context, userID, id int64, input mailreq.SaveAccountRequest) (repository.MailAccountView, error) {
	if s.cipher == nil {
		return repository.MailAccountView{}, maildomain.ErrDisabled
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || strings.ContainsAny(input.Name, "\x00\r\n") {
		return repository.MailAccountView{}, maildomain.ErrInvalid
	}
	var a repository.MailAccount
	var err error
	create := id == 0
	if create {
		address, e := mail.ParseAddress(strings.TrimSpace(input.Email))
		if e != nil || address.Address != strings.TrimSpace(input.Email) || len(address.Address) > 320 || providerHosts[input.Provider] == "" {
			return repository.MailAccountView{}, maildomain.ErrInvalid
		}
		a = repository.MailAccount{MailRecord: repository.NewMailRecord(userID), Name: input.Name, Provider: input.Provider, Email: strings.ToLower(address.Address), Enabled: true, NotifyEnabled: true, Version: 1}
		if input.Credential == "" {
			return repository.MailAccountView{}, maildomain.ErrInvalid
		}
	} else {
		a, err = s.repository.MailAccount.Account(ctx, userID, id)
		if err != nil {
			return repository.MailAccountView{}, err
		}
		if input.Version != a.Version {
			return repository.MailAccountView{}, maildomain.ErrConflict
		}
		if input.Email != "" && !strings.EqualFold(input.Email, a.Email) || input.Provider != "" && input.Provider != a.Provider {
			return repository.MailAccountView{}, maildomain.ErrInvalid
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
			return repository.MailAccountView{}, maildomain.ErrInvalid
		}
		allowed, err := s.repository.MailEvents.AllowConnection(ctx, userID)
		if err != nil {
			return repository.MailAccountView{}, err
		}
		if !allowed {
			return repository.MailAccountView{}, fmt.Errorf("%w：验证过于频繁，请稍后重试", maildomain.ErrInvalid)
		}
		secret := input.Credential
		if a.Provider == "Gmail" {
			secret = strings.ReplaceAll(secret, " ", "")
		}
		session, err := s.connectMailbox(ctx, a, secret)
		if err != nil {
			return repository.MailAccountView{}, err
		}
		_, _, err = session.selectInbox()
		session.close()
		if err != nil {
			return repository.MailAccountView{}, err
		}
		a.CredentialCiphertext = s.cipher.encrypt(a.ID, secret)
	}
	if err = s.repository.MailAccount.SaveAccount(ctx, a, create); err != nil {
		return repository.MailAccountView{}, err
	}
	if a.Enabled {
		if _, err = s.repository.MailSyncJob.Enqueue(ctx, userID, a.ID, "manual"); err != nil {
			return repository.MailAccountView{}, err
		}
	}
	records, err := s.Accounts(ctx, userID)
	if err != nil {
		return repository.MailAccountView{}, err
	}
	s.repository.MailEvents.Changed(ctx, userID)
	for _, record := range records {
		if record.ID == a.ID {
			return record, nil
		}
	}
	return repository.MailAccountView{}, maildomain.ErrNotFound
}

func (s *Service) Query(ctx context.Context, userID int64, input mailreq.MessagePageRequest) (repository.MailPage, error) {
	if input.Page < 1 {
		input.Page = 1
	}
	if input.PageSize == 0 {
		input.PageSize = 10
	}
	if input.Page > 100000 || input.PageSize < 1 || input.PageSize > 100 || utf8.RuneCountInString(input.SearchText) > 200 || input.Sort != "" && input.Sort != "newest" && input.Sort != "oldest" && input.Sort != "subject" {
		return repository.MailPage{}, maildomain.ErrInvalid
	}
	if input.AfterID != "" {
		if _, err := maildomain.ParseID(input.AfterID); err != nil {
			return repository.MailPage{}, err
		}
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input)
	if err != nil {
		return repository.MailPage{}, err
	}
	return s.repository.MailMessage.Query(ctx, userID, accountID, input, predicate)
}

// queryScope 统一用户边界和规则校验；批量接口同样不能绕过。
func (s *Service) queryScope(ctx context.Context, userID int64, input mailreq.MessagePageRequest) (int64, repository.MailMessagePredicate, error) {
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
		if _, err = s.repository.MailAccount.Account(ctx, userID, accountID); err != nil {
			return 0, nil, err
		}
	}
	predicate, err := repository.MailQueryPredicate(input.FilterQuery)
	if err != nil {
		return 0, nil, err
	}
	return accountID, predicate, nil
}

// bulkMessages 仅修改工作台状态，不写回远端邮箱或删除邮件。
func (s *Service) BulkMessages(ctx context.Context, userID int64, input mailreq.BulkMessagesRequest) (maildto.BulkResult, error) {
	if input.Action != "read" && input.Action != "archive-read" {
		return maildto.BulkResult{}, maildomain.ErrInvalid
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input.MessagePageRequest)
	if err != nil {
		return maildto.BulkResult{}, err
	}
	result, err := s.repository.MailMessage.BulkMessages(ctx, userID, accountID, input, predicate)
	if err == nil && result.Affected > 0 {
		s.repository.MailEvents.Changed(ctx, userID)
	}
	return result, err
}

func (s *Service) Overview(ctx context.Context, userID int64) (repository.MailOverview, error) {
	out, err := s.repository.MailMessage.Overview(ctx, userID)
	for i := range out.Accounts {
		s.decorateAccount(&out.Accounts[i])
	}
	return out, err
}

// openMessage 命中任何版本的正文缓存都立即返回；旧格式升级不阻塞阅读。
func (s *Service) OpenMessage(ctx context.Context, userID, id int64) (repository.MailMessageView, error) {
	view, err := s.repository.MailMessage.Message(ctx, userID, id)
	if err != nil {
		return view, err
	}
	if view.BodyFetchedAt != nil {
		if view.BodyFormatVersion < maildomain.BodyFormatVersion && s.cipher != nil {
			s.queueBodyRefresh(view.MailRecord)
		}
		return view, nil
	}
	body, err := s.fetchBody(ctx, userID, view.MailMessage)
	if err != nil {
		return view, err
	}
	if err = s.repository.MailBody.CacheBody(ctx, userID, id, body); err != nil {
		return view, err
	}
	view.BodyText = &body.Text
	view.BodyHTML = body.HTML
	view.Preview = maildomain.Preview(body.Text)
	return view, nil
}

// fetchBody 只负责远端读取；缓存更新与失败降级由调用方决定。
func (s *Service) fetchBody(ctx context.Context, userID int64, message repository.MailMessage) (maildto.MessageBody, error) {
	a, err := s.repository.MailAccount.Account(ctx, userID, message.AccountID)
	if err != nil {
		return maildto.MessageBody{}, err
	}
	secret, err := s.cipher.decrypt(a)
	if err != nil {
		return maildto.MessageBody{}, err
	}
	session, err := s.connectMailbox(ctx, a, secret)
	if err != nil {
		return maildto.MessageBody{}, err
	}
	defer session.close()
	if err = validateRemote(session, message); err != nil {
		return maildto.MessageBody{}, err
	}
	return session.body(message.RemoteUID)
}

// download resolves the part from owned database rows, never from a client-supplied IMAP path.
func (s *Service) Download(ctx context.Context, userID, id int64, consume func(repository.MailAttachment, io.Reader) error) error {
	attachment, err := s.repository.MailAttachment.Attachment(ctx, userID, id)
	if err != nil {
		return err
	}
	view, err := s.repository.MailMessage.Message(ctx, userID, attachment.MessageID)
	if err != nil {
		return err
	}
	a, err := s.repository.MailAccount.Account(ctx, userID, view.AccountID)
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
	if err = validateRemote(session, view.MailMessage); err != nil {
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
