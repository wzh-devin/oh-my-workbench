package todos

type PriorityResponse struct {
	ID       int64  `json:"id,string"`
	Value    int    `json:"value"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	Position int    `json:"position"`
	Version  int    `json:"version"`
}
