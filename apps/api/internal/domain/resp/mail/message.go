package mail

import "time"

type BulkMessagesResponse struct {
	Affected int64 `json:"affected"`
}

type MessageResponse struct {
	RecordResponse
	AccountID       int64     `json:"accountId,string"`
	Sender          string    `json:"sender"`
	Address         string    `json:"address"`
	Subject         string    `json:"subject"`
	Preview         string    `json:"preview"`
	BodyText        *string   `json:"body"`
	BodyHTML        *string   `json:"bodyHtml,omitempty"`
	ReceivedAt      time.Time `json:"receivedAt"`
	SizeBytes       int64     `json:"size"`
	IsRead          bool      `json:"read"`
	IsStarred       bool      `json:"starred"`
	IsArchived      bool      `json:"archived"`
	AttachmentCount int       `json:"attachmentCount"`
	Version         int       `json:"version"`
}

type MessageDetailResponse struct {
	MessageResponse
	Attachments []AttachmentResponse `json:"attachments"`
	TodoID      *int64               `json:"todoId,string,omitempty"`
}

type MessagePageResponse struct {
	Messages  []MessageResponse `json:"messages"`
	Total     int64             `json:"total"`
	NextAfter string            `json:"nextAfter"`
}
