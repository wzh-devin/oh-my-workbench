package todos

type ListRequest struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name"`
}
