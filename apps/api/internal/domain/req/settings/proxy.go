package settings

type ProxySaveRequest struct {
	ProxyURL *string `json:"proxyUrl"`
	Version  *int    `json:"version"`
}

type ProxySettingsRequest struct {
	ProxyURL string `json:"proxyUrl"`
	Version  int    `json:"version"`
}
