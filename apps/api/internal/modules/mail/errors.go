// 邮箱模块对外可识别的错误，不暴露上游认证响应。
package mail

import "errors"

var (
	ErrInvalid      = errors.New("邮箱参数无效")
	ErrNotFound     = errors.New("邮箱记录不存在")
	ErrConflict     = errors.New("记录已更新，请重新加载后再试")
	ErrDuplicate    = errors.New("该邮箱已经添加")
	ErrUnavailable  = errors.New("邮箱连接失败，请检查网络、服务开关和授权凭证")
	ErrNetwork      = errors.New("连接邮箱服务器失败，请检查网络后重试")
	ErrDisabled     = errors.New("邮箱服务未配置，请设置 MAIL_ENCRYPTION_KEY")
	ErrPushDisabled = errors.New("系统通知未配置，请设置 Web Push 密钥")
	ErrLease        = errors.New("邮箱监听已停止")
	ErrTooLarge     = errors.New("邮件正文超过 8 MiB，请到原邮箱查看")
)
