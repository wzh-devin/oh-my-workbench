package domain

import "strings"

// 只读 IMAP 连接、邮件头与 MIME 读取；取消请求即释放连接。
// MessageBody 同时保留原始 HTML 和摘要文本；渲染边界由隔离的浏览器文档负责。
type MessageBody struct {
	Text string
	HTML *string
}

// v2 缓存解码后的原始正文；HTML 安全策略统一在浏览器渲染边界应用。
const BodyFormatVersion = 2

func Preview(body string) string {
	value := []rune(strings.Join(strings.Fields(body), " "))
	if len(value) > 160 {
		value = value[:160]
	}
	return string(value)
}

// 同步游标、任务和监听租约；事务阻止过期执行者写入。
type IncomingMessage struct {
	Message     Message
	Attachments []Attachment
}
