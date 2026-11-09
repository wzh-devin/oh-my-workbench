package assets

type ConnectionStats struct {
	ID    int64 `json:"id,string"`
	Total int64 `json:"total"`
	Size  int64 `json:"size"`
}

type Statistics struct {
	Total     int64             `json:"total"`
	Size      int64             `json:"size"`
	Images    int64             `json:"images"`
	Documents int64             `json:"documents"`
	Daily     map[string]int64  `json:"daily"`
	Storage   []ConnectionStats `json:"storage"`
}
