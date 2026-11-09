package settings

type RuntimeSettings struct {
	JWTSecret               string `json:"jwtSecret"`
	MailEncryptionKey       string `json:"mailEncryptionKey"`
	CredentialEncryptionKey string `json:"credentialEncryptionKey"`
	VAPIDPublicKey          string `json:"vapidPublicKey"`
	VAPIDPrivateKey         string `json:"vapidPrivateKey"`
	ConverterURL            string `json:"converterUrl"`
	PushSubject             string `json:"pushSubject"`
}
