package domain

import "errors"

const SystemKey = "system.runtime"

var (
	ErrSystemInvalid     = errors.New("系统配置无效，请检查转换服务地址和推送联系地址")
	ErrSystemUnavailable = errors.New("系统配置暂不可用，请重试")
)

// RuntimeSettings 仅供服务内部持久化和初始化，管理接口必须使用 SystemView。
type RuntimeSettings struct {
	JWTSecret               string `json:"jwtSecret"`
	MailEncryptionKey       string `json:"mailEncryptionKey"`
	CredentialEncryptionKey string `json:"credentialEncryptionKey"`
	VAPIDPublicKey          string `json:"vapidPublicKey"`
	VAPIDPrivateKey         string `json:"vapidPrivateKey"`
	ConverterURL            string `json:"converterUrl"`
	PushSubject             string `json:"pushSubject"`
}

type SystemView struct {
	ConverterURL string `json:"converterUrl"`
	PushSubject  string `json:"pushSubject"`
	Version      int    `json:"version"`
}
