package todos

import "time"

type ListResponse struct {
	ID        int64     `json:"id,string"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type DeleteListResponse struct {
	ID    int64          `json:"id,string"`
	Tasks []TaskResponse `json:"todos"`
}
