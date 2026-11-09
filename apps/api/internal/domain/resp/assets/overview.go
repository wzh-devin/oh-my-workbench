package assets

type OverviewResponse struct {
	Connections []ConnectionResponse      `json:"connections"`
	Folders     []EntryResponse           `json:"folders"`
	Recent      []EntryResponse           `json:"recent"`
	Views       []ViewResponse            `json:"views"`
	Total       int64                     `json:"total"`
	Size        int64                     `json:"size"`
	Images      int64                     `json:"images"`
	Documents   int64                     `json:"documents"`
	Daily       map[string]int64          `json:"daily"`
	Storage     []ConnectionStatsResponse `json:"storage"`
}
