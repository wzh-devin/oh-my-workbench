package notes

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"regexp"

	notedto "github.com/devin/oh-my-workbench/api/internal/domain/dto/notes"
	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
)

type keyring struct {
	active  string
	ciphers map[string]cipher.AEAD
}

func decodeKeyring(data []byte) (notedto.Keyring, error) {
	var raw notedto.Keyring
	if len(data) > 16384 {
		return raw, notedomain.ErrUnavailable
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&raw) != nil || len(raw.Keys) == 0 || len(raw.Keys) > 16 {
		return raw, notedomain.ErrUnavailable
	}
	var trailing any
	if decoder.Decode(&trailing) != io.EOF {
		return raw, notedomain.ErrUnavailable
	}
	return raw, nil
}

func newKeyring(raw notedto.Keyring) (*keyring, error) {
	ring := &keyring{active: raw.Active, ciphers: map[string]cipher.AEAD{}}
	for id, encoded := range raw.Keys {
		if !regexp.MustCompile("^[a-zA-Z0-9-]{1,64}$").MatchString(id) {
			return nil, notedomain.ErrUnavailable
		}
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(key) != 32 || base64.StdEncoding.EncodeToString(key) != encoded {
			return nil, notedomain.ErrUnavailable
		}
		block, err := aes.NewCipher(key)
		if err != nil {
			return nil, notedomain.ErrUnavailable
		}
		aead, err := cipher.NewGCM(block)
		if err != nil {
			return nil, notedomain.ErrUnavailable
		}
		ring.ciphers[id] = aead
	}
	if ring.ciphers[ring.active] == nil {
		return nil, notedomain.ErrUnavailable
	}
	return ring, nil
}

func aad(user, note int64) []byte { return []byte(fmt.Sprintf("omw-note:v1:%d:%d", user, note)) }

func (k *keyring) encrypt(user, note int64, plain string) ([]byte, string, error) {
	if k == nil {
		return nil, "", notedomain.ErrUnavailable
	}
	aead := k.ciphers[k.active]
	prefix := make([]byte, 1+aead.NonceSize())
	prefix[0] = 1
	if _, err := rand.Read(prefix[1:]); err != nil {
		return nil, "", notedomain.ErrUnavailable
	}
	return aead.Seal(prefix, prefix[1:], []byte(plain), aad(user, note)), k.active, nil
}

func (k *keyring) decrypt(user, note int64, keyID string, encrypted []byte) (string, error) {
	if k == nil {
		return "", notedomain.ErrUnavailable
	}
	aead := k.ciphers[keyID]
	if aead == nil || len(encrypted) < 1+aead.NonceSize()+aead.Overhead() || encrypted[0] != 1 {
		return "", notedomain.ErrUnavailable
	}
	plain, err := aead.Open(nil, encrypted[1:1+aead.NonceSize()], encrypted[1+aead.NonceSize():], aad(user, note))
	if err != nil {
		return "", notedomain.ErrUnavailable
	}
	return string(plain), nil
}
