package auth

type UserInfo struct {
	ID          int64  `json:"id,string"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func userInfo(user User) UserInfo {
	return UserInfo{
		ID:          user.ID,
		Username:    user.Username,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		IsAdmin:     user.IsAdmin,
	}
}
