package todos

import "encoding/json"

type TaskPageRequest struct {
	PageNum     int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	ViewID      string          `json:"viewId"`
	ListID      string          `json:"listId"`
	Search      string          `json:"search"`
	Sort        string          `json:"sort"`
	FilterQuery json.RawMessage `json:"filterQuery"`
}
