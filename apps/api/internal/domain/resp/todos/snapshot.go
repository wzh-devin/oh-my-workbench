package todos

type SnapshotResponse struct {
	Lists      []ListResponse     `json:"todoLists"`
	Tasks      []TaskResponse     `json:"todos"`
	Views      []ViewResponse     `json:"todoViews"`
	Priorities []PriorityResponse `json:"todoPriorities"`
}
