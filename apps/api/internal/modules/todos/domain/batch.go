package domain

// BatchItem keeps optimistic concurrency on every item of a batch.
type BatchItem struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}
type BatchRequest struct {
	Items []BatchItem `json:"items"`
}
