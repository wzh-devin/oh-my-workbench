package notes

import "encoding/json"

type SavedViewResponse struct {
	BuiltinKey  *string         `json:"builtinKey"`
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	Scope       string          `json:"scope"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}
