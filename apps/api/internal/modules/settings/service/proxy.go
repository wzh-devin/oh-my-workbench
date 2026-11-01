package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"net/url"
	"slices"
	"strings"

	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	settingsrepo "github.com/devin/oh-my-workbench/api/internal/modules/settings/repository"
	"github.com/devin/oh-my-workbench/api/internal/platform/outbound"
	"github.com/devin/oh-my-workbench/api/internal/shared/credentialkey"
)

var services = []string{outbound.QQ, outbound.Gmail, outbound.Push, outbound.Storage, outbound.Converter}

type ProxyService struct {
	repository *settingsrepo.ProxyRepository
	cipher     cipher.AEAD
}

func NewProxyService(repository *settingsrepo.ProxyRepository, keyFile string) (*ProxyService, error) {
	key, err := credentialkey.Load("", keyFile)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	cipher, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &ProxyService{repository: repository, cipher: cipher}, nil
}

func (s *ProxyService) decrypt(userID int64, service string, encrypted []byte) (string, error) {
	if len(encrypted) == 0 {
		return "", nil
	}
	n := s.cipher.NonceSize()
	if len(encrypted) < n {
		return "", fmt.Errorf("代理配置无法解密")
	}
	value, err := s.cipher.Open(nil, encrypted[:n], encrypted[n:], []byte(fmt.Sprintf("%d:%s", userID, service)))
	if err != nil {
		return "", fmt.Errorf("代理配置无法解密")
	}
	return string(value), nil
}

func (s *ProxyService) view(service string, record settingsdomain.Setting) (settingsdomain.View, error) {
	address, err := s.decrypt(record.UserID, service, record.Value)
	if err != nil {
		return settingsdomain.View{}, err
	}
	view := settingsdomain.View{Service: service, Version: record.Version, Configured: address != ""}
	if address != "" {
		u, err := url.Parse(address)
		if err != nil {
			return view, fmt.Errorf("代理配置无法读取")
		}
		u.User = nil
		view.Address = u.String()
	}
	return view, nil
}

func (s *ProxyService) List(ctx context.Context, userID int64) ([]settingsdomain.View, error) {
	records, err := s.repository.List(ctx, userID, services)
	if err != nil {
		return nil, err
	}
	out := make([]settingsdomain.View, 0, len(services))
	for _, service := range services {
		record := settingsdomain.Setting{UserID: userID, Key: settingsdomain.ProxyKeyPrefix + service}
		for _, saved := range records {
			if saved.Key == record.Key {
				record = saved
				break
			}
		}
		view, err := s.view(service, record)
		if err != nil {
			return nil, err
		}
		out = append(out, view)
	}
	return out, nil
}

// ProxyURL is only consumed inside the API process; authenticated responses never contain credentials.
func (s *ProxyService) ProxyURL(ctx context.Context, userID int64, service string) (string, error) {
	if !slices.Contains(services, service) {
		return "", settingsdomain.ErrInvalid
	}
	record, err := s.repository.Get(ctx, userID, service)
	if err != nil {
		return "", err
	}
	return s.decrypt(userID, service, record.Value)
}

func (s *ProxyService) Save(ctx context.Context, userID int64, service string, input settingsdomain.Input) (settingsdomain.View, error) {
	address := strings.TrimSpace(input.ProxyURL)
	if !slices.Contains(services, service) || input.Version < 0 || len(address) > 2048 || strings.ContainsAny(address, "\x00\r\n") {
		return settingsdomain.View{}, settingsdomain.ErrInvalid
	}
	if _, err := outbound.NewDialer(address); err != nil {
		return settingsdomain.View{}, settingsdomain.ErrInvalid
	}
	var encrypted []byte
	if address != "" {
		nonce := make([]byte, s.cipher.NonceSize())
		if _, err := rand.Read(nonce); err != nil {
			return settingsdomain.View{}, err
		}
		encrypted = s.cipher.Seal(nonce, nonce, []byte(address), []byte(fmt.Sprintf("%d:%s", userID, service)))
	}
	record, err := s.repository.Save(ctx, userID, service, encrypted, input.Version)
	if err != nil {
		return settingsdomain.View{}, err
	}
	return s.view(service, record)
}
