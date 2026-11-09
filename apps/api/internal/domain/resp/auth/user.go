package auth

type UserResponse struct {
	ID          int64  `json:"id,string"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}
