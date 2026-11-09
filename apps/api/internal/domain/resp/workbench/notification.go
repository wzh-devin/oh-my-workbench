package workbench

type NotificationResponse struct {
	ID     string `json:"id"`
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	Href   string `json:"href"`
	Unread bool   `json:"unread"`
}

type NotificationPageResponse struct {
	Records []NotificationResponse `json:"records"`
	Total   int64                  `json:"total"`
}
