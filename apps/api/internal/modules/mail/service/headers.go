package service

import (
	"mime"
	"strings"

	imap "github.com/emersion/go-imap/v2"
	message "github.com/emersion/go-message"
	"github.com/emersion/go-message/charset"
	"github.com/emersion/go-message/mail"
	"github.com/emersion/go-message/textproto"
)

// 原始 RFC 5322 邮件头经成熟 MIME 解析器转换，复用现有消息与附件映射。
func envelopeFromHeader(raw textproto.Header) *imap.Envelope {
	header := mail.Header{Header: message.Header{Header: raw}}
	date, _ := header.Date()
	subject, _ := header.Subject() // Unknown charsets retain the original text.
	messageID, _ := header.MessageID()
	addresses := func(key string) []imap.Address {
		parsed, _ := header.AddressList(key)
		out := make([]imap.Address, 0, len(parsed))
		for _, address := range parsed {
			at := strings.LastIndexByte(address.Address, '@')
			if at < 0 {
				continue
			}
			// Some senders quote encoded display names, which address parsers leave undecoded.
			name := address.Name
			if decoded, err := (&mime.WordDecoder{CharsetReader: charset.Reader}).DecodeHeader(name); err == nil {
				name = decoded
			}
			out = append(out, imap.Address{Name: name, Mailbox: address.Address[:at], Host: address.Address[at+1:]})
		}
		return out
	}
	return &imap.Envelope{Date: date, Subject: subject, MessageID: messageID, From: addresses("From"), To: addresses("To"), Cc: addresses("Cc")}
}
