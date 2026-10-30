// 只读 IMAP 连接、邮件头与 MIME 读取；取消请求即释放连接。
package mail

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime"
	"mime/quotedprintable"
	"net"
	"slices"
	"strconv"
	"strings"
	"time"

	imap "github.com/emersion/go-imap/v2"
	"github.com/emersion/go-imap/v2/imapclient"
	"github.com/emersion/go-message/charset"
	"github.com/emersion/go-message/textproto"
	"golang.org/x/net/html"
)

var providerHosts = map[string]string{"QQ": "imap.qq.com", "Gmail": "imap.gmail.com"}

const bodyLimit = 8 << 20

// mailboxSession serializes commands on one read-only connection; cancel closes blocked I/O.
type mailboxSession struct {
	client  *imapclient.Client
	conn    net.Conn
	changes chan struct{}
	stop    func() bool
}

func (s *Service) connectMailbox(ctx context.Context, a Account, secret string) (*mailboxSession, error) {
	host := providerHosts[a.Provider]
	if host == "" {
		return nil, ErrInvalid
	}
	conn, err := dialMailboxTLS(ctx, s.dialer, net.JoinHostPort(host, "993"), &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	if err != nil {
		if ctx.Err() == nil {
			log.Printf("邮箱 TLS 连接失败: provider=%s error=%v", a.Provider, err)
		}
		return nil, ErrNetwork
	}
	changes := make(chan struct{}, 1)
	client := imapclient.New(conn, &imapclient.Options{WordDecoder: &mime.WordDecoder{CharsetReader: charset.Reader},
		UnilateralDataHandler: &imapclient.UnilateralDataHandler{Mailbox: func(_ *imapclient.UnilateralDataMailbox) {
			select {
			case changes <- struct{}{}:
			default:
			}
		}}})
	session := &mailboxSession{client: client, conn: conn, changes: changes}
	session.stop = context.AfterFunc(ctx, func() { _ = conn.Close() })
	session.deadline()
	if client.WaitGreeting() != nil || client.Login(a.Email, secret).Wait() != nil {
		session.close()
		return nil, ErrUnavailable
	}
	return session, nil
}
func (s *mailboxSession) close()    { s.stop(); _ = s.client.Close() }
func (s *mailboxSession) deadline() { _ = s.conn.SetDeadline(time.Now().Add(30 * time.Second)) }
func (s *mailboxSession) selectInbox() (uint32, uint32, error) {
	s.deadline()
	data, err := s.client.Select("INBOX", &imap.SelectOptions{ReadOnly: true}).Wait()
	if err != nil {
		return 0, 0, ErrUnavailable
	}
	ceiling := uint32(0)
	if data.UIDNext > 0 {
		ceiling = uint32(data.UIDNext) - 1
	}
	return data.UIDValidity, ceiling, nil
}

// batch returns at most 100 headers; absent UIDs are safe to advance past.
func (s *mailboxSession) batch(start, end uint32) ([]incomingMessage, uint32, bool, error) {
	if start == 0 || start > end {
		return nil, end, true, nil
	}
	s.deadline()
	var ids imap.UIDSet
	ids.AddRange(imap.UID(start), imap.UID(end))
	search, err := s.client.UIDSearch(&imap.SearchCriteria{UID: []imap.UIDSet{ids}}, nil).Wait()
	if err != nil {
		return nil, 0, false, ErrUnavailable
	}
	uids := search.AllUIDs()
	slices.Sort(uids)
	// Servers may normalize reversed ranges; never accept UIDs outside this request.
	uids = slices.DeleteFunc(uids, func(uid imap.UID) bool { return uint32(uid) < start || uint32(uid) > end })
	done := len(uids) <= 100
	if len(uids) > 100 {
		uids = uids[:100]
	}
	if len(uids) == 0 {
		return nil, end, true, nil
	}
	// QQ can return an empty HEADER.FIELDS projection; fetch the complete header with PEEK.
	headerSection := &imap.FetchItemBodySection{Specifier: imap.PartSpecifierHeader, Peek: true}
	command := s.client.Fetch(imap.UIDSetNum(uids...), &imap.FetchOptions{UID: true, Flags: true, InternalDate: true, RFC822Size: true, BodyStructure: &imap.FetchItemBodyStructure{Extended: true}, BodySection: []*imap.FetchItemBodySection{headerSection}})
	buffers, err := command.Collect()
	if err != nil {
		return nil, 0, false, ErrUnavailable
	}
	records := make([]incomingMessage, 0, len(buffers))
	for _, buffer := range buffers {
		raw := buffer.FindBodySection(headerSection)
		if raw == nil || buffer.UID == 0 {
			return nil, 0, false, ErrUnavailable
		}
		header, err := textproto.ReadHeader(bufio.NewReader(bytes.NewReader(raw)))
		if err != nil {
			return nil, 0, false, ErrUnavailable
		}
		buffer.Envelope = envelopeFromHeader(header)
		records = append(records, messageFromIMAP(buffer))
	}
	cursor := uint32(uids[len(uids)-1])
	if done {
		cursor = end
	}
	return records, cursor, done, nil
}
func messageFromIMAP(b *imapclient.FetchMessageBuffer) incomingMessage {
	e := b.Envelope
	sender, address := "未知发件人", ""
	if len(e.From) > 0 {
		sender = e.From[0].Name
		address = e.From[0].Addr()
		if sender == "" {
			sender = address
		}
	}
	recipients, _ := json.Marshal(map[string]any{"to": e.To, "cc": e.Cc})
	received := b.InternalDate
	if received.IsZero() {
		received = e.Date
	}
	if received.IsZero() {
		received = time.Now().UTC()
	}
	m := Message{RemoteUID: uint32(b.UID), RFCMessageID: e.MessageID, Sender: sender, Address: address, Subject: e.Subject, Recipients: string(recipients), ReceivedAt: received, SizeBytes: b.RFC822Size}
	for _, flag := range b.Flags {
		if flag == imap.FlagSeen {
			m.IsRead = true
		}
		if flag == imap.FlagFlagged {
			m.IsStarred = true
		}
	}
	attachments := []Attachment{}
	if b.BodyStructure != nil {
		b.BodyStructure.Walk(func(path []int, structure imap.BodyStructure) bool {
			part, ok := structure.(*imap.BodyStructureSinglePart)
			if !ok {
				return true
			}
			disposition := part.Disposition()
			if part.Filename() == "" && (disposition == nil || !strings.EqualFold(disposition.Value, "attachment")) {
				return part.MessageRFC822 == nil
			}
			name := part.Filename()
			if name == "" {
				name = "attachment"
			}
			if decoded, err := (&mime.WordDecoder{CharsetReader: charset.Reader}).DecodeHeader(name); err == nil {
				name = decoded
			}
			attachments = append(attachments, Attachment{PartID: partPath(path), Filename: name, ContentType: part.MediaType(), Encoding: part.Encoding, Charset: part.Params["charset"], SizeBytes: int64(part.Size)})
			return false
		})
	}
	return incomingMessage{Message: m, Attachments: attachments}
}
func partPath(path []int) string {
	if len(path) == 0 {
		return "1"
	}
	parts := make([]string, len(path))
	for i, part := range path {
		parts[i] = strconv.Itoa(part)
	}
	return strings.Join(parts, ".")
}
func parsePart(value string) ([]int, error) {
	out := []int{}
	for _, part := range strings.Split(value, ".") {
		n, err := strconv.Atoi(part)
		if err != nil || n < 1 || n > 10000 || len(out) >= 32 {
			return nil, ErrInvalid
		}
		out = append(out, n)
	}
	return out, nil
}
func decodedPart(reader io.Reader, encoding string) io.Reader {
	switch strings.ToLower(encoding) {
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, reader)
	case "quoted-printable":
		return quotedprintable.NewReader(reader)
	}
	return reader
}

// streamPart decodes MIME transfer encoding without buffering attachment contents.
func (s *mailboxSession) streamPart(uid uint32, partID, encoding string, consume func(io.Reader) error) error {
	path, err := parsePart(partID)
	if err != nil {
		return err
	}
	s.deadline()
	command := s.client.Fetch(imap.UIDSetNum(imap.UID(uid)), &imap.FetchOptions{BodySection: []*imap.FetchItemBodySection{{Part: path, Peek: true}}})
	defer command.Close()
	message := command.Next()
	if message == nil {
		return ErrNotFound
	}
	consumed := false
	for item := message.Next(); item != nil; item = message.Next() {
		section, ok := item.(imapclient.FetchItemDataBodySection)
		if !ok || section.Literal == nil {
			continue
		}
		consumed = true
		if err := consume(decodedPart(section.Literal, encoding)); err != nil {
			return err
		}
	}
	if !consumed {
		return ErrNotFound
	}
	return command.Close()
}

// messageBody 同时保留原始 HTML 和摘要文本；渲染边界由隔离的浏览器文档负责。
type messageBody struct {
	Text string
	HTML *string
}

// v2 缓存解码后的原始正文；HTML 安全策略统一在浏览器渲染边界应用。
const bodyFormatVersion = 2

// body 优先读取 MIME 的 HTML 正文，排除附件，并限制解码后体积。
func (s *mailboxSession) body(uid uint32) (messageBody, error) {
	s.deadline()
	buffers, err := s.client.Fetch(imap.UIDSetNum(imap.UID(uid)), &imap.FetchOptions{BodyStructure: &imap.FetchItemBodyStructure{Extended: true}}).Collect()
	if err != nil {
		return messageBody{}, ErrUnavailable
	}
	if len(buffers) == 0 || buffers[0].BodyStructure == nil {
		return messageBody{}, ErrNotFound
	}
	var selected *imap.BodyStructureSinglePart
	var selectedPath string
	buffers[0].BodyStructure.Walk(func(path []int, structure imap.BodyStructure) bool {
		part, ok := structure.(*imap.BodyStructureSinglePart)
		if !ok {
			return true
		}
		if part.Filename() != "" {
			return false
		}
		disposition := part.Disposition()
		if disposition != nil && strings.EqualFold(disposition.Value, "attachment") {
			return false
		}
		media := part.MediaType()
		if media == "text/html" && (selected == nil || selected.MediaType() != "text/html") || media == "text/plain" && selected == nil {
			selected = part
			selectedPath = partPath(path)
		}
		return false
	})
	if selected == nil {
		return messageBody{}, nil
	}
	var body string
	err = s.streamPart(uid, selectedPath, selected.Encoding, func(reader io.Reader) error {
		raw, err := io.ReadAll(io.LimitReader(reader, bodyLimit+1))
		if err != nil {
			return err
		}
		if len(raw) > bodyLimit {
			return ErrTooLarge
		}
		if encoding := selected.Params["charset"]; encoding != "" {
			decoded, err := charset.Reader(encoding, strings.NewReader(string(raw)))
			if err != nil {
				return err
			}
			raw, err = io.ReadAll(io.LimitReader(decoded, bodyLimit+1))
			if err != nil {
				return err
			}
			if len(raw) > bodyLimit {
				return ErrTooLarge
			}
		}
		body = string(raw)

		return nil
	})
	if err != nil {
		return messageBody{}, err
	}
	if selected.MediaType() == "text/html" {
		return messageBody{Text: htmlText(body), HTML: &body}, nil
	}
	return messageBody{Text: body}, nil
}

// htmlText extracts readable content without executing HTML or fetching remote images.
func htmlText(value string) string {
	tokenizer := html.NewTokenizer(strings.NewReader(value))
	var out strings.Builder
	hidden := 0
	for {
		kind := tokenizer.Next()
		if kind == html.ErrorToken {
			break
		}
		token := tokenizer.Token()
		switch kind {
		case html.StartTagToken:
			if token.Data == "script" || token.Data == "style" || token.Data == "head" {
				hidden++
			}
			if hidden == 0 && (token.Data == "br" || token.Data == "p" || token.Data == "div" || token.Data == "li") {
				out.WriteByte('\n')
			}
		case html.EndTagToken:
			if (token.Data == "script" || token.Data == "style" || token.Data == "head") && hidden > 0 {
				hidden--
			}
			if hidden == 0 && (token.Data == "p" || token.Data == "div" || token.Data == "li") {
				out.WriteByte('\n')
			}
		case html.TextToken:
			if hidden == 0 {
				out.WriteString(token.Data)
			}
		}
	}
	return strings.TrimSpace(out.String())
}
func preview(body string) string {
	value := []rune(strings.Join(strings.Fields(body), " "))
	if len(value) > 160 {
		value = value[:160]
	}
	return string(value)
}
func validateRemote(s *mailboxSession, m Message) error {
	validity, _, err := s.selectInbox()
	if err != nil {
		return err
	}
	if validity != m.UIDValidity {
		return fmt.Errorf("%w：远端邮件索引已变化", ErrNotFound)
	}
	return nil
}
