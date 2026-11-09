package mail

type OverviewResponse struct {
	Accounts             []AccountDetailResponse      `json:"accounts"`
	Messages             []MessageResponse            `json:"messages"`
	Notifications        []NotificationDetailResponse `json:"notifications"`
	NotificationCount    int64                        `json:"notificationCount"`
	Total                int64                        `json:"total"`
	Unread               int64                        `json:"unread"`
	LatestReceivedAt     *string                      `json:"latestReceivedAt"`
	Daily                map[string]int64             `json:"daily"`
	NotificationsEnabled bool                         `json:"notificationsEnabled"`
}
