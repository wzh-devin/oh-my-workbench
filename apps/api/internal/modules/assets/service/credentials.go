package service

import (
	"crypto/rand"
	"encoding/json"
	"fmt"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
)

// 存储凭证采用独立 AES-GCM 密钥，密文绑定用户和连接，API 不返回明文。
func (s *Service) encrypt(connection assetdomain.Connection, access, secret string) ([]byte, error) {
	if s.cipher == nil {
		return nil, assetdomain.ErrDisabled
	}
	plain, _ := json.Marshal([]string{access, secret})
	nonce := make([]byte, s.cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.cipher.Seal(nonce, nonce, plain, []byte(fmt.Sprintf("%d:%d", connection.UserID, connection.ID))), nil
}

func (s *Service) credentials(c assetdomain.Connection) (string, string, error) {
	if s.cipher == nil {
		return "", "", assetdomain.ErrDisabled
	}
	n := s.cipher.NonceSize()
	if len(c.CredentialCiphertext) < n {
		return "", "", assetdomain.ErrDisabled
	}
	plain, err := s.cipher.Open(nil, c.CredentialCiphertext[:n], c.CredentialCiphertext[n:], []byte(fmt.Sprintf("%d:%d", c.UserID, c.ID)))
	var keys []string
	if err != nil || json.Unmarshal(plain, &keys) != nil || len(keys) != 2 {
		return "", "", assetdomain.ErrDisabled
	}
	return keys[0], keys[1], nil
}
