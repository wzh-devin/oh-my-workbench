package assets

import "encoding/json"

type SaveViewRequest struct {
	ID          string          `json:"id,omitempty"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}

type DeleteViewsRequest struct {
	Items []BatchItemRequest `json:"items"`
}
