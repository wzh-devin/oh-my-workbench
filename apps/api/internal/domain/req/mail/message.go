package mail

import "encoding/json"

type MessagePageRequest struct {
	AccountID   string          `json:"accountId"`
	SearchText  string          `json:"searchText"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Page        int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	Sort        string          `json:"sort"`
	Archived    bool            `json:"archived"`
	AfterID     string          `json:"afterId"`
}

type UpdateMessageRequest struct {
	ID       string `json:"id,omitempty"`
	Version  int    `json:"version"`
	Read     *bool  `json:"read"`
	Starred  *bool  `json:"starred"`
	Archived *bool  `json:"archived"`
}

type BulkMessagesRequest struct {
	MessagePageRequest
	Action string `json:"action"`
}
