// 存储凭证采用独立 AES-GCM 密钥，密文绑定用户和连接，API 不返回明文。
package assets

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
)

func (s *Service) encrypt(connection Connection, access, secret string) ([]byte, error) {
	if s.cipher == nil {
		return nil, ErrDisabled
	}
	plain, _ := json.Marshal([]string{access, secret})
	nonce := make([]byte, s.cipher.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return s.cipher.Seal(nonce, nonce, plain, []byte(fmt.Sprintf("%d:%d", connection.UserID, connection.ID))), nil
}
func (s *Service) credentials(c Connection) (string, string, error) {
	if s.cipher == nil {
		return "", "", ErrDisabled
	}
	n := s.cipher.NonceSize()
	if len(c.CredentialCiphertext) < n {
		return "", "", ErrDisabled
	}
	plain, err := s.cipher.Open(nil, c.CredentialCiphertext[:n], c.CredentialCiphertext[n:], []byte(fmt.Sprintf("%d:%d", c.UserID, c.ID)))
	var keys []string
	if err != nil || json.Unmarshal(plain, &keys) != nil || len(keys) != 2 {
		return "", "", ErrDisabled
	}
	return keys[0], keys[1], nil
}
