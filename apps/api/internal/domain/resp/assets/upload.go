package assets

import "time"

type UploadPartResponse struct {
	BaseResponse
	PartNumber int    `json:"number"`
	SizeBytes  int64  `json:"size"`
	SHA256     string `json:"sha256"`
	Status     string `json:"status"`
}

type UploadResponse struct {
	BaseResponse
	ConnectionID   int64                `json:"connectionId,string"`
	ParentID       *int64               `json:"parentId,string"`
	FileName       string               `json:"name"`
	ContentType    string               `json:"type"`
	ExpectedSHA256 string               `json:"sha256"`
	SizeBytes      int64                `json:"size"`
	PartSize       int64                `json:"partSize"`
	PartCount      int                  `json:"partCount"`
	RequestKey     string               `json:"requestKey"`
	Status         string               `json:"status"`
	ExpiresAt      time.Time            `json:"expiresAt"`
	LastError      string               `json:"error"`
	Version        int                  `json:"version"`
	Parts          []UploadPartResponse `json:"parts"`
	Entry          *EntryResponse       `json:"entry,omitempty"`
}
