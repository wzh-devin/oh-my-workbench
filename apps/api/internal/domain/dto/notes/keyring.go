package notes

type Keyring struct {
	Active string            `json:"active"`
	Keys   map[string]string `json:"keys"`
}
