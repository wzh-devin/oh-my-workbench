package mail

import "time"

type NotificationPreferencesResponse struct {
	NotificationsEnabled bool `json:"notificationsEnabled"`
}

type NotificationResponse struct {
	RecordResponse
	MessageID int64      `json:"messageId,string"`
	ReadAt    *time.Time `json:"readAt"`
}

type NotificationDetailResponse struct {
	NotificationResponse
	Subject string `json:"subject"`
	Sender  string `json:"sender"`
}
