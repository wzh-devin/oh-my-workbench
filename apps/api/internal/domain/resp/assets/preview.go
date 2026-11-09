package assets

type PreviewResponse struct {
	BaseResponse
	RendererVersion string `json:"rendererVersion"`
	Status          string `json:"status"`
	SizeBytes       int64  `json:"size"`
	LastError       string `json:"error"`
}

type ThumbnailResponse struct {
	Status  string `json:"status"`
	Version string `json:"version,omitempty"`
}
