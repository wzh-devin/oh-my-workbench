package mail

type AttachmentResponse struct {
	RecordResponse
	Filename    string `json:"name"`
	ContentType string `json:"contentType"`
	SizeBytes   int64  `json:"size"`
}
