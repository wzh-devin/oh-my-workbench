// 邮箱授权凭证的加密与账号绑定，密钥独立于登录会话。
package mail

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
)

// credentialCipher keeps mailbox secrets separate from session-signing keys.
type credentialCipher struct{ aead cipher.AEAD }

func newCredentialCipher(encoded string) (*credentialCipher, error) {
	if encoded == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("MAIL_ENCRYPTION_KEY 必须为 Base64 编码的 32 字节密钥")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	return &credentialCipher{aead: aead}, err
}
func (c *credentialCipher) encrypt(accountID int64, secret string) []byte {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}
	return c.aead.Seal(nonce, nonce, []byte(secret), []byte(fmt.Sprint(accountID)))
}
func (c *credentialCipher) decrypt(account Account) (string, error) {
	if c == nil {
		return "", ErrDisabled
	}
	n := c.aead.NonceSize()
	if len(account.CredentialCiphertext) < n {
		return "", ErrUnavailable
	}
	value, err := c.aead.Open(nil, account.CredentialCiphertext[:n], account.CredentialCiphertext[n:], []byte(fmt.Sprint(account.ID)))
	if err != nil {
		return "", ErrUnavailable
	}
	return string(value), nil
}
