package notes

type SaveNotebookRequest struct {
	TargetRequest
	Name string `json:"name"`
}
