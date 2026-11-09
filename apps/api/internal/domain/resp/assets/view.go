package assets

import "encoding/json"

type ViewResponse struct {
	BaseResponse
	Name        string          `json:"name"`
	Icon        string          `json:"icon"`
	BuiltinKey  *string         `json:"builtinKey"`
	FilterQuery json.RawMessage `json:"filterQuery"`
	Sort        string          `json:"sort"`
	Version     int             `json:"version"`
}
