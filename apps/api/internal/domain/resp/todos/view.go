package todos

import "encoding/json"

type ViewResponse struct {
	ID          int64           `json:"id,string"`
	BuiltinKey  *string         `json:"builtinKey"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	SearchText  string          `json:"searchText"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}
