package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	repo "github.com/devin/oh-my-workbench/api/internal/modules/notes/repository"
)

// PrepareKeys only creates a missing keyring for an empty database; recovery never generates a replacement.
func PrepareKeys(ctx context.Context, repository *repo.Repository, path string) error {
	return repository.PrepareKeys(ctx, func(ids []string) error {
		if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
			if len(ids) != 0 {
				return errors.New("记事本已有正文或历史版本，禁止生成新密钥；请恢复原独立密钥文件")
			}
			if err := createKeyring(path); err != nil {
				return err
			}
		} else if err != nil {
			return fmt.Errorf("无法检查记事本密钥文件: %w", err)
		}
		return CheckKeys(path, ids)
	})
}

func CheckKeys(path string, ids []string) error {
	keys, err := loadKeyring(path)
	if err != nil {
		return fmt.Errorf("记事本密钥缺失、不可读或格式无效，请检查独立目录挂载及文件权限: %w", err)
	}
	for _, id := range ids {
		if keys.ciphers[id] == nil {
			return errors.New("记事本密钥文件缺少正文或历史版本引用的旧密钥，请恢复完整密钥文件")
		}
	}
	return nil
}

func createKeyring(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("创建记事本密钥目录失败: %w", err)
	}
	var key [32]byte
	var id [16]byte
	if _, err := rand.Read(key[:]); err != nil {
		return err
	}
	if _, err := rand.Read(id[:]); err != nil {
		return err
	}
	keyID := hex.EncodeToString(id[:])
	raw, err := json.Marshal(map[string]any{"active": keyID, "keys": map[string]string{keyID: base64.StdEncoding.EncodeToString(key[:])}})
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".notes-keys-*")
	if err != nil {
		return fmt.Errorf("写入记事本密钥失败: %w", err)
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if _, err := file.Write(append(raw, '\n')); err != nil {
		return err
	}
	// The preparation container runs as root; only newly generated files change ownership.
	if os.Geteuid() == 0 {
		if err := file.Chown(1001, 1001); err != nil {
			return err
		}
		if err := os.Chown(dir, 1001, 1001); err != nil {
			return err
		}
		if err := os.Chmod(dir, 0700); err != nil {
			return err
		}
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	// A hard link publishes a complete file atomically and cannot replace an existing keyring.
	if err := os.Link(file.Name(), path); err != nil && !errors.Is(err, os.ErrExist) {
		return fmt.Errorf("保存记事本密钥失败: %w", err)
	}
	directory, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}
