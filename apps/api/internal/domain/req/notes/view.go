package notes

import "encoding/json"

type SaveViewRequest struct {
	TargetRequest
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
}
