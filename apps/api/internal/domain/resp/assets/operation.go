package assets

type OperationResponse struct {
	BaseResponse
	Kind       string `json:"kind"`
	Status     string `json:"status"`
	RequestKey string `json:"requestKey"`
	LastError  string `json:"error"`
}
