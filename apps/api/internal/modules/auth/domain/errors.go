package domain

import "errors"

var (
	ErrInput        = errors.New("参数错误")
	ErrCredentials  = errors.New("用户名或密码错误")
	ErrInitialized  = errors.New("系统已初始化，请登录")
	ErrUsername     = errors.New("用户名已存在")
	ErrUnauthorized = errors.New("请先登录")
	ErrRateLimited  = errors.New("登录过于频繁，请稍后再试")
	ErrIntegrity    = errors.New("账号数据不一致")
)

var (
	ErrCurrentPassword   = errors.New("当前密码不正确")
	ErrPasswordInput     = errors.New("密码需要 6–24 个字符")
	ErrPasswordUnchanged = errors.New("新密码不能与当前密码相同")
	ErrPasswordConflict  = errors.New("密码已变更，请重新登录后再试")
)
