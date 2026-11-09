package auth

type SessionResponse struct {
	User      UserResponse `json:"user"`
	ExpiresAt int64        `json:"expiresAt"`
}

type LoginResponse struct {
	Token string       `json:"token"`
	User  UserResponse `json:"user"`
}

type TokenResponse struct {
	Token string `json:"token"`
}
