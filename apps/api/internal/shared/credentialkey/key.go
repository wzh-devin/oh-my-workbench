package credentialkey

import (
	"encoding/base64"
	"fmt"
)

// Decode 校验数据库提供的凭证密钥；空值允许独立服务禁用凭证功能。
func Decode(encoded string) ([]byte, error) {
	if encoded == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("凭证加密密钥必须为 Base64 编码的 32 字节值")
	}
	return key, nil
}
