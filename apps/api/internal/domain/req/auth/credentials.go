package auth

type CredentialsRequest struct {
	Username string `json:"username" binding:"required,max=64"`
	Password string `json:"password" binding:"required,min=6,max=24"`
}
