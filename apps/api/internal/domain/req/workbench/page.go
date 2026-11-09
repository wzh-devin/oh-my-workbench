package workbench

type RecordPageRequest struct {
	PageNum  int      `json:"pageNum"`
	PageSize int      `json:"pageSize"`
	Kind     string   `json:"kind"`
	Search   string   `json:"search"`
	Sort     string   `json:"sort"`
	ReadIDs  []string `json:"readIds"`
	Kinds    []string `json:"kinds"`
}
