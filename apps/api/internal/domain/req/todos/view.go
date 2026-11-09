package todos

import "encoding/json"

type ViewRequest struct {
	ID          string          `json:"id,omitempty"`
	Version     int             `json:"version"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	SearchText  string          `json:"searchText"`
	Sort        string          `json:"sort"`
}
