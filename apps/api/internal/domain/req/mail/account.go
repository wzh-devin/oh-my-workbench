package mail

type SaveAccountRequest struct {
	ID            string `json:"id,omitempty"`
	Name          string `json:"name"`
	Provider      string `json:"provider"`
	Email         string `json:"email"`
	Credential    string `json:"credential"`
	Enabled       *bool  `json:"enabled"`
	NotifyEnabled *bool  `json:"notifyEnabled"`
	Version       int    `json:"version"`
}
