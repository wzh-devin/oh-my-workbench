package assets

type BatchItemRequest struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type BatchRequest struct {
	Entries      []BatchItemRequest `json:"entries"`
	Action       string             `json:"action"`
	ConnectionID string             `json:"connectionId"`
	ParentID     *string            `json:"parentId"`
	Starred      bool               `json:"starred"`
	RequestKey   string             `json:"requestKey"`
}
