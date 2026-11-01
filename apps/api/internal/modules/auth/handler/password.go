package handler

import (
	"net/http"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

func (h Handler) RegisterSecurityRoutes(r *gin.RouterGroup) {
	r.GET("", h.Security)
	r.POST("/password", h.ChangePassword)
}

func (h Handler) Security(c *gin.Context) {
	state, err := h.service.Security(c.Request.Context(), CurrentUserID(c))
	if err != nil {
		authError(c, err)
		return
	}
	response.Success(c, state)
}

func (h Handler) ChangePassword(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var req struct {
		Current string `json:"currentPassword" binding:"required,min=6,max=24"`
		Next    string `json:"newPassword" binding:"required,min=6,max=24"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, "请输入当前密码和 6–24 个字符的新密码")
		return
	}
	value, err := h.service.ChangePassword(c.Request.Context(), CurrentUserID(c), req.Current, req.Next)
	if err != nil {
		authError(c, err)
		return
	}
	h.setCookie(c, value, int(authdomain.SessionDuration.Seconds()))
	response.Success(c, gin.H{"token": value})
}
