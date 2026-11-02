package domain

import "encoding/json"

// QueryInput 单次只定位当前用户的一个视图或清单，复杂规则仍保持完整AST。
type QueryInput struct {
	PageNum     int             `json:"pageNum"`
	PageSize    int             `json:"pageSize"`
	ViewID      string          `json:"viewId"`
	ListID      string          `json:"listId"`
	Search      string          `json:"search"`
	Sort        string          `json:"sort"`
	FilterQuery json.RawMessage `json:"filterQuery"`
}
type TaskPage struct {
	Records  []TaskView `json:"records"`
	Total    int64      `json:"total"`
	PageNum  int        `json:"pageNum"`
	PageSize int        `json:"pageSize"`
}
