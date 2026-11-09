package mail

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

type credentialCipher struct{ aead cipher.AEAD }

func newCredentialCipher(encoded string) (*credentialCipher, error) {
	if encoded == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("邮箱凭证密钥无效，请恢复系统配置")
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

func (c *credentialCipher) decrypt(account repository.MailAccount) (string, error) {
	if c == nil {
		return "", maildomain.ErrDisabled
	}
	n := c.aead.NonceSize()
	if len(account.CredentialCiphertext) < n {
		return "", maildomain.ErrUnavailable
	}
	value, err := c.aead.Open(nil, account.CredentialCiphertext[:n], account.CredentialCiphertext[n:], []byte(fmt.Sprint(account.ID)))
	if err != nil {
		return "", maildomain.ErrUnavailable
	}
	return string(value), nil
}
