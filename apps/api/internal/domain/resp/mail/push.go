package mail

type PushConfigResponse struct {
	PublicKey      string `json:"publicKey"`
	MailConfigured bool   `json:"mailConfigured"`
}
