package auth

import "github.com/gin-gonic/gin"

func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/status", h.Status)
	r.POST("/login", h.Login)
	r.POST("/initSystemAdmin", h.InitSystemAdmin)
	r.GET("/me", h.RequireSession, h.Me)
	r.POST("/logout", h.Logout)
}

// CurrentUserID 仅从 RequireSession 已验证的会话读取身份。
func CurrentUserID(c *gin.Context) int64 { return c.MustGet("auth.session").(Session).User.ID }
