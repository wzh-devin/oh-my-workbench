package todos

type PriorityRequest struct {
	Value   int    `json:"value"`
	Name    string `json:"name"`
	Color   string `json:"color"`
	Version int    `json:"version"`
}

type PrioritiesRequest struct {
	Priorities []PriorityRequest `json:"priorities"`
}
