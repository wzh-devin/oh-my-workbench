package settings

import (
	"bytes"
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/mail"
	"net/url"
	"strings"

	webpush "github.com/SherClockHolmes/webpush-go"

	settingsdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/settings"
	settingsreq "github.com/devin/oh-my-workbench/api/internal/domain/req/settings"
	settingsresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/settings"
	settingsdomain "github.com/devin/oh-my-workbench/api/internal/domain/settings"
	"github.com/devin/oh-my-workbench/api/internal/repository"
)

type SystemService struct{ repository *repository.Store }

func NewSystemService(repository *repository.Store) *SystemService {
	return &SystemService{repository: repository}
}

// Initialize 原子保存首次生成的密钥；多实例启动和重启均使用数据库中的值。
func (s *SystemService) Initialize(ctx context.Context) (settingsdto.RuntimeSettings, error) {
	runtime := settingsdto.RuntimeSettings{ConverterURL: "http://127.0.0.1:13039"}
	record, err := s.repository.SystemSetting.Get(ctx, 0, settingsdomain.SystemKey)
	if err != nil {
		return runtime, settingsdomain.ErrSystemUnavailable
	}
	if record.ID != 0 {
		return decodeRuntime(record.Value)
	}
	for _, key := range []*string{&runtime.JWTSecret, &runtime.MailEncryptionKey, &runtime.CredentialEncryptionKey} {
		value := make([]byte, 32)
		if _, err := rand.Read(value); err != nil {
			return runtime, err
		}
		*key = base64.StdEncoding.EncodeToString(value)
	}
	runtime.VAPIDPrivateKey, runtime.VAPIDPublicKey, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return runtime, err
	}
	value, err := json.Marshal(runtime)
	if err != nil {
		return runtime, err
	}
	record, err = s.repository.SystemSetting.InitializeSystem(ctx, settingsdomain.SystemKey, value)
	if err != nil {
		return runtime, settingsdomain.ErrSystemUnavailable
	}
	return decodeRuntime(record.Value)
}

func decodeRuntime(value []byte) (settingsdto.RuntimeSettings, error) {
	var runtime settingsdto.RuntimeSettings
	if err := json.Unmarshal(value, &runtime); err != nil {
		return runtime, fmt.Errorf("系统密钥配置损坏，请恢复原数据库记录")
	}
	return runtime, validateRuntime(runtime)
}

func validateRuntime(runtime settingsdto.RuntimeSettings) error {
	if len(runtime.JWTSecret) < 32 {
		return fmt.Errorf("登录签名密钥无效，请恢复原配置")
	}
	for _, encoded := range []string{runtime.MailEncryptionKey, runtime.CredentialEncryptionKey} {
		key, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil || len(key) != 32 {
			return fmt.Errorf("凭证加密密钥无效，请恢复原配置")
		}
	}
	public, e1 := base64.RawURLEncoding.DecodeString(runtime.VAPIDPublicKey)
	private, e2 := base64.RawURLEncoding.DecodeString(runtime.VAPIDPrivateKey)
	key, e3 := ecdh.P256().NewPrivateKey(private)
	if e1 != nil || e2 != nil || e3 != nil || key == nil || !bytes.Equal(key.PublicKey().Bytes(), public) {
		return fmt.Errorf("Web Push 密钥无效，请恢复原配置")
	}
	return validateSystem(settingsreq.SystemSettingsRequest{ConverterURL: runtime.ConverterURL, PushSubject: runtime.PushSubject, Version: 1})
}

func validateSystem(input settingsreq.SystemSettingsRequest) error {
	if input.Version < 1 || len(input.ConverterURL) > 2048 || len(input.PushSubject) > 2048 {
		return settingsdomain.ErrSystemInvalid
	}
	u, err := url.Parse(input.ConverterURL)
	if err != nil || u == nil || (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.ForceQuery || strings.Contains(input.ConverterURL, "#") {
		return settingsdomain.ErrSystemInvalid
	}
	if input.PushSubject == "" {
		return nil
	}
	u, err = url.Parse(input.PushSubject)
	if err != nil || u == nil || strings.ContainsAny(input.PushSubject, "\r\n\x00") {
		return settingsdomain.ErrSystemInvalid
	}
	if u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Fragment == "" {
		return nil
	}
	if u.Scheme == "mailto" && u.RawQuery == "" && u.Fragment == "" {
		address, err := mail.ParseAddress(u.Opaque)
		if err == nil && address.Address == u.Opaque {
			return nil
		}
	}
	return settingsdomain.ErrSystemInvalid
}

func (s *SystemService) read(ctx context.Context) (repository.SystemSetting, settingsdto.RuntimeSettings, error) {
	record, err := s.repository.SystemSetting.Get(ctx, 0, settingsdomain.SystemKey)
	if err != nil || record.ID == 0 {
		return record, settingsdto.RuntimeSettings{}, settingsdomain.ErrSystemUnavailable
	}
	runtime, err := decodeRuntime(record.Value)
	if err != nil {
		return record, runtime, settingsdomain.ErrSystemUnavailable
	}
	return record, runtime, nil
}

// View 只投影普通配置，私钥不得进入 HTTP 响应。
func (s *SystemService) View(ctx context.Context) (settingsresp.SystemSettingsResponse, error) {
	var view settingsresp.SystemSettingsResponse
	record, err := s.repository.SystemSetting.Get(ctx, 0, settingsdomain.SystemKey)
	if err != nil || record.ID == 0 || json.Unmarshal(record.Value, &view) != nil {
		return view, settingsdomain.ErrSystemUnavailable
	}
	// 密钥已在启动时校验；热读取只解码并验证普通字段，不重复派生公钥。
	view.Version = record.Version
	if validateSystem(settingsreq.SystemSettingsRequest(view)) != nil {
		return view, settingsdomain.ErrSystemUnavailable
	}
	return view, nil
}

func (s *SystemService) Save(ctx context.Context, input settingsreq.SystemSettingsRequest) (settingsresp.SystemSettingsResponse, error) {
	input.ConverterURL = strings.TrimRight(strings.TrimSpace(input.ConverterURL), "/")
	input.PushSubject = strings.TrimSpace(input.PushSubject)
	if err := validateSystem(input); err != nil {
		return settingsresp.SystemSettingsResponse(input), err
	}
	_, runtime, err := s.read(ctx)
	if err != nil {
		return settingsresp.SystemSettingsResponse(input), err
	}
	runtime.ConverterURL, runtime.PushSubject = input.ConverterURL, input.PushSubject
	value, err := json.Marshal(runtime)
	if err != nil {
		return settingsresp.SystemSettingsResponse(input), settingsdomain.ErrSystemUnavailable
	}
	if _, err := s.repository.SystemSetting.SaveSystem(ctx, value, input.Version); err != nil {
		return settingsresp.SystemSettingsResponse(input), err
	}
	return s.View(ctx)
}

func (s *SystemService) ConverterURL(ctx context.Context) (string, error) {
	view, err := s.View(ctx)
	return view.ConverterURL, err
}

func (s *SystemService) PushSubject(ctx context.Context) (string, error) {
	view, err := s.View(ctx)
	return view.PushSubject, err
}
