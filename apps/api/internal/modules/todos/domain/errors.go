package domain

import "errors"

var (
	ErrInvalid   = errors.New("待办数据格式不正确")
	ErrNotFound  = errors.New("记录不存在")
	ErrConflict  = errors.New("记录已更新，请刷新后重试")
	ErrListName  = errors.New("已有同名清单，请换一个名称")
	ErrViewName  = errors.New("已有同名视图，请换一个名称")
	ErrLastView  = errors.New("至少保留一个视图")
	ErrViewLimit = errors.New("最多创建 100 个视图")
	ErrRule      = errors.New("视图规则不正确或引用的清单已不存在")
)
