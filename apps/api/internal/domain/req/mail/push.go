package mail

import "encoding/json"

type UnsubscribeRequest struct {
	Endpoint string `json:"endpoint"`
}

type SubscribePushRequest struct {
	ExpirationTime json.RawMessage `json:"expirationTime"`
	Endpoint       string          `json:"endpoint"`
	Keys           struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}
