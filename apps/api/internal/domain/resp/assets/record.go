package assets

import "time"

type BaseResponse struct {
	ID        int64     `json:"id,string"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
