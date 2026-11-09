package settings

type ProxySettingsResponse struct {
	Service    string `json:"service"`
	Configured bool   `json:"configured"`
	Address    string `json:"address"`
	Version    int    `json:"version"`
}
