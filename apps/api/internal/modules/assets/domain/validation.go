package domain

import (
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// AlwaysRule 是列表与默认视图共用的无条件规则。
const AlwaysRule = `{"schemaVersion":1,"root":{"kind":"constant","value":true}}`

// 资产标识、名称、大小和排序的共用校验。
const (
	MaxFileSize        int64 = 10 << 30
	MultipartThreshold int64 = 32 << 20
	PartSize           int64 = 8 << 20
)

func FormatID(id int64) string { return strconv.FormatInt(id, 10) }

func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 || FormatID(id) != value {
		return 0, ErrInvalid
	}
	return id, nil
}

func ParentID(value *string) (*int64, error) {
	if value == nil {
		return nil, nil
	}
	id, err := ParseID(*value)
	return &id, err
}

func ValidText(value string, max int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= max && !strings.ContainsFunc(value, unicode.IsControl)
}

func ValidName(value string) bool {
	return ValidText(value, 200) && value == strings.TrimSpace(value) && value != "." && value != ".." && !strings.ContainsAny(value, "/\\")
}

func ValidSort(value string) bool {
	switch value {
	case "name", "name-desc", "date", "date-asc", "size", "size-asc", "opened", "created", "created-asc":
		return true
	}
	return false
}
