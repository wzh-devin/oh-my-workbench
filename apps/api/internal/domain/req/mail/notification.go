package mail

type ReadNotificationsRequest struct {
	IDs []string `json:"ids"`
	All bool     `json:"all"`
}

type PreferencesRequest struct {
	Enabled *bool `json:"enabled"`
}
