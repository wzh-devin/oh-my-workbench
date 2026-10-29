package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

const (
	memory           = 19 * 1024
	iterations       = 2
	parallelism      = 1
	maxPasswordBytes = 1024
)

var (
	ErrTooLong     = errors.New("密码超过计算长度上限")
	ErrInvalidHash = errors.New("密码摘要格式无效")
	ErrBusy        = errors.New("密码计算繁忙，请稍后重试")

	slots = make(chan struct{}, 4)

	parameters = fmt.Sprintf(
		"m=%d,t=%d,p=%d",
		memory,
		iterations,
		parallelism,
	)
)

// Hash 生成包含算法参数和随机盐的密码摘要。
func Hash(plainPassword string) (string, error) {
	if len(plainPassword) > maxPasswordBytes {
		return "", ErrTooLong
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}

	key, err := derive(plainPassword, salt)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"$argon2id$v=19$%s$%s$%s",
		parameters,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

// Verify 密码不匹配返回 false、nil；摘要损坏或资源不足返回错误。
func Verify(plainPassword, encodedHash string) (bool, error) {
	if len(plainPassword) > maxPasswordBytes {
		return false, ErrTooLong
	}
	if len(encodedHash) > 256 {
		return false, ErrInvalidHash
	}

	parts := strings.Split(encodedHash, "$")

	// shortcut: 仅接受当前参数；升级时需同时保留历史参数的验证逻辑。
	if len(parts) != 6 ||
		parts[0] != "" ||
		parts[1] != "argon2id" ||
		parts[2] != "v=19" ||
		parts[3] != parameters {
		return false, ErrInvalidHash
	}

	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil || len(salt) != 16 {
		return false, ErrInvalidHash
	}

	expected, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil || len(expected) != 32 {
		return false, ErrInvalidHash
	}

	actual, err := derive(plainPassword, salt)
	if err != nil {
		return false, err
	}

	return subtle.ConstantTimeCompare(actual, expected) == 1, nil
}

func derive(plainPassword string, salt []byte) ([]byte, error) {
	// 并发已满时直接失败，不让请求无限排队。
	select {
	case slots <- struct{}{}:
		defer func() { <-slots }()
	default:
		return nil, ErrBusy
	}

	return argon2.IDKey(
		[]byte(plainPassword),
		salt,
		iterations,
		memory,
		parallelism,
		32,
	), nil
}
