package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"regexp"

	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
)

// The keyring is deliberately outside PostgreSQL and never automatically regenerated.
const KeyFile = "../../.secrets/notes-keys.json"

type keyring struct {
	active  string
	ciphers map[string]cipher.AEAD
}

func loadKeyring(path string) (*keyring, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, d.ErrUnavailable
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 16384 {
		return nil, d.ErrUnavailable
	}
	var raw struct {
		Active string            `json:"active"`
		Keys   map[string]string `json:"keys"`
	}
	decoder := json.NewDecoder(file)
	if decoder.Decode(&raw) != nil || len(raw.Keys) == 0 || len(raw.Keys) > 16 {
		return nil, d.ErrUnavailable
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return nil, d.ErrUnavailable
	}
	ring := &keyring{active: raw.Active, ciphers: map[string]cipher.AEAD{}}
	for id, encoded := range raw.Keys {
		if !regexp.MustCompile("^[a-zA-Z0-9-]{1,64}$").MatchString(id) {
			return nil, d.ErrUnavailable
		}
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(key) != 32 {
			return nil, d.ErrUnavailable
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, d.ErrUnavailable
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, d.ErrUnavailable
		}
		ring.ciphers[id] = aead
	}
	if ring.ciphers[ring.active] == nil {
		return nil, d.ErrUnavailable
	}
	return ring, nil
}
func aad(user, note int64) []byte { return []byte(fmt.Sprintf("omw-note:v1:%d:%d", user, note)) }
func (k *keyring) encrypt(user, note int64, plain string) ([]byte, string, error) {
	if k == nil {
		return nil, "", d.ErrUnavailable
	}
	aead := k.ciphers[k.active]
	prefix := make([]byte, 1+aead.NonceSize())
	prefix[0] = 1
	if _, err := rand.Read(prefix[1:]); err != nil {
		return nil, "", d.ErrUnavailable
	}
	return aead.Seal(prefix, prefix[1:], []byte(plain), aad(user, note)), k.active, nil
}
func (k *keyring) decrypt(user, note int64, keyID string, encrypted []byte) (string, error) {
	if k == nil {
		return "", d.ErrUnavailable
	}
	aead := k.ciphers[keyID]
	if aead == nil || len(encrypted) < 1+aead.NonceSize()+aead.Overhead() || encrypted[0] != 1 {
		return "", d.ErrUnavailable
	}
	plain, err := aead.Open(nil, encrypted[1:1+aead.NonceSize()], encrypted[1+aead.NonceSize():], aad(user, note))
	if err != nil {
		return "", d.ErrUnavailable
	}
	return string(plain), nil
}
