package domain

import "strconv"

// 邮箱参数校验与业务编排，不直接访问数据库。
func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 {
		return 0, ErrInvalid
	}
	return id, nil
}
