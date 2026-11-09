package assets

type InitUploadRequest struct {
	ConnectionID string  `json:"connectionId"`
	ParentID     *string `json:"parentId"`
	Name         string  `json:"name"`
	ContentType  string  `json:"type"`
	Size         int64   `json:"size"`
	SHA256       string  `json:"sha256"`
	RequestKey   string  `json:"requestKey"`
	LegacyID     *string `json:"legacyId"`
}

type ControlUploadRequest struct {
	Status  string `json:"status"`
	Version int    `json:"version"`
}
