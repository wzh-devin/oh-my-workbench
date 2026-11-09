package settings

type SystemSettingsResponse struct {
	ConverterURL string `json:"converterUrl"`
	PushSubject  string `json:"pushSubject"`
	Version      int    `json:"version"`
}
