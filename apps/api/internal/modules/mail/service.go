// 邮箱参数校验与业务编排，不直接访问数据库。
package mail

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/net/proxy"
)

// Options are deployment secrets; mailbox configuration never supplies network endpoints.
type Options struct {
	EncryptionKey   string
	ProxyURL        string
	VAPIDPublicKey  string
	VAPIDPrivateKey string
	VAPIDSubject    string
}
type Service struct {
	repository         *Repository
	cipher             *credentialCipher
	options            Options
	dialer             proxy.ContextDialer
	bodyRefresh        chan Record
	bodyRefreshPending sync.Map
}

func NewService(repository *Repository, options Options) (*Service, error) {
	dialer, err := newMailboxDialer(options.ProxyURL)
	if err != nil {
		return nil, err
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
			return nil, fmt.Errorf("WEB_PUSH_VAPID_PUBLIC_KEY / PRIVATE_KEY 不匹配")
		}
		subject, err := url.Parse(options.VAPIDSubject)
		if err != nil || subject == nil || (subject.Scheme != "mailto" && subject.Scheme != "https") {
			return nil, fmt.Errorf("WEB_PUSH_SUBJECT 必须为 mailto: 或 HTTPS 地址")
		}
	}
	return &Service{repository: repository, cipher: cipher, options: options, dialer: dialer, bodyRefresh: make(chan Record, 32)}, nil
}
func recordID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalid
	}
	return id, nil
}
func (s *Service) accounts(ctx context.Context, userID int64) ([]AccountView, error) {
	records, err := s.repository.accountViews(ctx, userID)
	for i := range records {
		s.decorateAccount(&records[i])
	}
	return records, err
}
func (s *Service) decorateAccount(a *AccountView) {
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

// saveAccount tests only newly supplied credentials; pausing never requires an IMAP connection.
func (s *Service) saveAccount(ctx context.Context, userID, id int64, input AccountInput) (AccountView, error) {
	if s.cipher == nil {
		return AccountView{}, ErrDisabled
	}
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || strings.ContainsAny(input.Name, "\x00\r\n") {
		return AccountView{}, ErrInvalid
	}
	var a Account
	var err error
	create := id == 0
	if create {
		address, e := mail.ParseAddress(strings.TrimSpace(input.Email))
		if e != nil || address.Address != strings.TrimSpace(input.Email) || len(address.Address) > 320 || providerHosts[input.Provider] == "" {
			return AccountView{}, ErrInvalid
		}
		a = Account{Record: newRecord(userID), Name: input.Name, Provider: input.Provider, Email: strings.ToLower(address.Address), Enabled: true, NotifyEnabled: true, Version: 1}
		if input.Credential == "" {
			return AccountView{}, ErrInvalid
		}
	} else {
		a, err = s.repository.account(ctx, userID, id)
		if err != nil {
			return AccountView{}, err
		}
		if input.Version != a.Version {
			return AccountView{}, ErrConflict
		}
		if input.Email != "" && !strings.EqualFold(input.Email, a.Email) || input.Provider != "" && input.Provider != a.Provider {
			return AccountView{}, ErrInvalid
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
			return AccountView{}, ErrInvalid
		}
		allowed, err := s.repository.allowConnection(ctx, userID)
		if err != nil {
			return AccountView{}, err
		}
		if !allowed {
			return AccountView{}, fmt.Errorf("%w：验证过于频繁，请稍后重试", ErrInvalid)
		}
		secret := input.Credential
		if a.Provider == "Gmail" {
			secret = strings.ReplaceAll(secret, " ", "")
		}
		session, err := s.connectMailbox(ctx, a, secret)
		if err != nil {
			return AccountView{}, err
		}
		_, _, err = session.selectInbox()
		session.close()
		if err != nil {
			return AccountView{}, err
		}
		a.CredentialCiphertext = s.cipher.encrypt(a.ID, secret)
	}
	if err = s.repository.saveAccount(ctx, a, create); err != nil {
		return AccountView{}, err
	}
	if a.Enabled {
		if _, err = s.repository.enqueue(ctx, userID, a.ID, "manual"); err != nil {
			return AccountView{}, err
		}
	}
	records, err := s.accounts(ctx, userID)
	if err != nil {
		return AccountView{}, err
	}
	s.repository.changed(ctx, userID)
	for _, record := range records {
		if record.ID == a.ID {
			return record, nil
		}
	}
	return AccountView{}, ErrNotFound
}
func (s *Service) query(ctx context.Context, userID int64, input QueryInput) (QueryResult, error) {
	if input.Page < 1 {
		input.Page = 1
	}
	if input.PageSize == 0 {
		input.PageSize = 10
	}
	if input.Page > 100000 || input.PageSize < 1 || input.PageSize > 100 || utf8.RuneCountInString(input.SearchText) > 200 || input.Sort != "" && input.Sort != "newest" && input.Sort != "oldest" && input.Sort != "subject" {
		return QueryResult{}, ErrInvalid
	}
	if input.AfterID != "" {
		if _, err := recordID(input.AfterID); err != nil {
			return QueryResult{}, err
		}
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input)
	if err != nil {
		return QueryResult{}, err
	}
	return s.repository.query(ctx, userID, accountID, input, predicate)
}

// queryScope 统一用户边界和规则校验；批量接口同样不能绕过。
func (s *Service) queryScope(ctx context.Context, userID int64, input QueryInput) (int64, messagePredicate, error) {
	if utf8.RuneCountInString(input.SearchText) > 200 {
		return 0, nil, ErrInvalid
	}
	accountID := int64(0)
	if input.AccountID != "" && input.AccountID != "all" {
		var err error
		accountID, err = recordID(input.AccountID)
		if err != nil {
			return 0, nil, err
		}
		if _, err = s.repository.account(ctx, userID, accountID); err != nil {
			return 0, nil, err
		}
	}
	predicate, err := queryPredicate(input.FilterQuery)
	if err != nil {
		return 0, nil, err
	}
	return accountID, predicate, nil
}

// bulkMessages 仅修改工作台状态，不写回远端邮箱或删除邮件。
func (s *Service) bulkMessages(ctx context.Context, userID int64, input BulkInput) (BulkResult, error) {
	if input.Action != "read" && input.Action != "archive-read" {
		return BulkResult{}, ErrInvalid
	}
	accountID, predicate, err := s.queryScope(ctx, userID, input.QueryInput)
	if err != nil {
		return BulkResult{}, err
	}
	result, err := s.repository.bulkMessages(ctx, userID, accountID, input, predicate)
	if err == nil && result.Affected > 0 {
		s.repository.changed(ctx, userID)
	}
	return result, err
}
func (s *Service) overview(ctx context.Context, userID int64) (Overview, error) {
	out, err := s.repository.overview(ctx, userID)
	for i := range out.Accounts {
		s.decorateAccount(&out.Accounts[i])
	}
	return out, err
}

// openMessage 命中任何版本的正文缓存都立即返回；旧格式升级不阻塞阅读。
func (s *Service) openMessage(ctx context.Context, userID, id int64) (MessageView, error) {
	view, err := s.repository.message(ctx, userID, id)
	if err != nil {
		return view, err
	}
	if view.BodyFetchedAt != nil {
		if view.BodyFormatVersion < bodyFormatVersion && s.cipher != nil {
			s.queueBodyRefresh(view.Record)
		}
		return view, nil
	}
	body, err := s.fetchBody(ctx, userID, view.Message)
	if err != nil {
		return view, err
	}
	if err = s.repository.cacheBody(ctx, userID, id, body); err != nil {
		return view, err
	}
	view.BodyText = &body.Text
	view.BodyHTML = body.HTML
	view.Preview = preview(body.Text)
	return view, nil
}

// fetchBody 只负责远端读取；缓存更新与失败降级由调用方决定。
func (s *Service) fetchBody(ctx context.Context, userID int64, message Message) (messageBody, error) {
	a, err := s.repository.account(ctx, userID, message.AccountID)
	if err != nil {
		return messageBody{}, err
	}
	secret, err := s.cipher.decrypt(a)
	if err != nil {
		return messageBody{}, err
	}
	session, err := s.connectMailbox(ctx, a, secret)
	if err != nil {
		return messageBody{}, err
	}
	defer session.close()
	if err = validateRemote(session, message); err != nil {
		return messageBody{}, err
	}
	return session.body(message.RemoteUID)
}

// download resolves the part from owned database rows, never from a client-supplied IMAP path.
func (s *Service) download(ctx context.Context, userID, id int64, consume func(Attachment, io.Reader) error) error {
	attachment, err := s.repository.attachment(ctx, userID, id)
	if err != nil {
		return err
	}
	view, err := s.repository.message(ctx, userID, attachment.MessageID)
	if err != nil {
		return err
	}
	a, err := s.repository.account(ctx, userID, view.AccountID)
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
