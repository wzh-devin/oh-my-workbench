package notes

type TargetRequest struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
}

type BatchRequest struct {
	Targets []TargetRequest `json:"targets"`
}
