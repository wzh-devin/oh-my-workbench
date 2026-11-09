package notes

import "errors"

var (
	ErrViewConflict   = errors.New("视图已在其他位置更新，请重新加载后重试")
	ErrViewName       = errors.New("视图名称已存在")
	ErrLastView       = errors.New("至少保留一个视图")
	ErrPasskeyChanged = errors.New("通行密钥已变更，请重新验证")
	ErrVerification   = errors.New("通行密钥验证失败，请重试或使用登录密码")
	ErrInvalid        = errors.New("笔记内容或参数无效")
	ErrNotFound       = errors.New("笔记或笔记本不存在")
	ErrConflict       = errors.New("笔记已在其他位置更新，请比较后重试")
	ErrLocked         = errors.New("请先解锁笔记")
	ErrUnavailable    = errors.New("记事本密钥不可用，请恢复数据库中的原密钥记录后重启服务")
)
