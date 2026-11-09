package todos

type BatchItemRequest struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type BatchRequest struct {
	Items []BatchItemRequest `json:"items"`
}
