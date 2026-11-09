package settings

import "errors"

var (
	ErrInvalid           = errors.New("代理配置无效，请使用 socks5:// 或 socks5h:// 地址")
	ErrConflict          = errors.New("配置已变更，请刷新后重试")
	ErrSystemInvalid     = errors.New("系统配置无效，请检查转换服务地址和推送联系地址")
	ErrSystemUnavailable = errors.New("系统配置暂不可用，请重试")
)
