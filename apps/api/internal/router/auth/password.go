package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authreq "github.com/devin/oh-my-workbench/api/internal/domain/req/auth"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func (h Router) RegisterSecurityRoutes(r *gin.RouterGroup) {
	r.GET("", h.Security)
	r.POST("/password", h.ChangePassword)
}

func (h Router) Security(c *gin.Context) {
	state, err := h.service.Security(c.Request.Context(), CurrentUserID(c))
	if err != nil {
		authError(c, err)
		return
	}
	response.Success(c, state)
}

func (h Router) ChangePassword(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var req authreq.PasswordRequest
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
	response.Success(c, authresp.TokenResponse{Token: value})
}
