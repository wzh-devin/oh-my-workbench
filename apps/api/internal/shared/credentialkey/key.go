package credentialkey

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// 工作台本地管理凭证加密密钥；原子创建，重启复用，不交给存储服务配置。
// 显式密钥兼容已有部署；未指定时由工作台在私有数据目录生成并持久化。
func Load(encoded, path string) ([]byte, error) {
	if encoded != "" {
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(key) != 32 {
			return nil, fmt.Errorf("凭证加密密钥必须为 Base64 编码的 32 字节值")
		}
		return key, nil
	}
	if path == "" {
		return nil, nil
	}
	key, err := readCredentialKey(path)
	if !os.IsNotExist(err) {
		return key, err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	file, err := os.CreateTemp(dir, ".asset-key-")
	if err != nil {
		return nil, err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if _, err := file.Write(key); err != nil {
		return nil, err
	}
	if err := file.Sync(); err != nil {
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	// 先完整落盘再原子发布；并发启动只读取胜出者，绝不覆盖已有密钥。
	if err := os.Link(file.Name(), path); err != nil && !os.IsExist(err) {
		return nil, err
	}
	directory, err := os.Open(dir)
	if err != nil {
		return nil, err
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return nil, err
	}
	return readCredentialKey(path)
}

func readCredentialKey(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0077 != 0 {
		return nil, fmt.Errorf("凭证密钥文件必须为仅当前账户可读写的普通文件")
	}
	key, err := io.ReadAll(io.LimitReader(file, 33))
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("凭证密钥文件无效，请恢复原密钥")
	}
	return key, nil
}
