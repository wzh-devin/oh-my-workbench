package settings

type SystemSaveRequest struct {
	ConverterURL *string `json:"converterUrl"`
	PushSubject  *string `json:"pushSubject"`
	Version      *int    `json:"version"`
}

type SystemSettingsRequest struct {
	ConverterURL string
	PushSubject  string
	Version      int
}
