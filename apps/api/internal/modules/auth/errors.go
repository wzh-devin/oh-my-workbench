package auth

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
