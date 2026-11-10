package notes

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"

	notedto "github.com/devin/oh-my-workbench/api/internal/domain/dto/notes"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

const keyringSetting = "notes.keyring"

// PrepareKeys initializes an empty database once and validates existing key references.
func PrepareKeys(ctx context.Context, repos *repository.Store) error {
	_, err := prepareKeys(ctx, repos)
	return err
}

func prepareKeys(ctx context.Context, repos *repository.Store) (*keyring, error) {
	var keys *keyring
	err := repos.Note.PrepareKeys(ctx, func(tx *repository.Store, ids []string) error {
		record, err := tx.SystemSetting.Get(ctx, 0, keyringSetting)
		if err != nil {
			return errors.New("无法读取数据库笔记密钥")
		}
		if record.ID == 0 {
			if len(ids) != 0 {
				return errors.New("已有笔记或历史版本但数据库缺少密钥，请恢复原数据库密钥记录；禁止生成替代密钥")
			}
			var key [32]byte
			var id [16]byte
			if _, err := rand.Read(key[:]); err != nil {
				return err
			}
			if _, err := rand.Read(id[:]); err != nil {
				return err
			}
			active := hex.EncodeToString(id[:])
			data, err := json.Marshal(notedto.Keyring{Active: active, Keys: map[string]string{active: base64.StdEncoding.EncodeToString(key[:])}})
			if err != nil {
				return err
			}
			record, err = tx.SystemSetting.InitializeSystem(ctx, keyringSetting, data)
			if err != nil {
				return errors.New("无法保存数据库笔记密钥")
			}
		}
		raw, err := decodeKeyring(record.Value)
		if err != nil {
			return errors.New("数据库笔记密钥格式无效，请恢复原记录；未覆盖密钥")
		}
		keys, err = newKeyring(raw)
		if err != nil {
			return errors.New("数据库笔记密钥无效，请恢复原记录；未覆盖密钥")
		}
		for _, id := range ids {
			if keys.ciphers[id] == nil {
				return errors.New("数据库笔记密钥缺少正文或历史引用的旧密钥，请恢复完整密钥集合")
			}
		}
		return nil
	})
	return keys, err
}
