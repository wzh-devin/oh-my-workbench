package auth

type PasswordRequest struct {
	Current string `json:"currentPassword" binding:"required,min=6,max=24"`
	Next    string `json:"newPassword" binding:"required,min=6,max=24"`
}
