package handler

import (
	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	service "github.com/devin/oh-my-workbench/api/internal/modules/notes/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func (h *Handler) passkeys(r *gin.RouterGroup) {
	r.POST("/passkeys/status", func(c *gin.Context) {
		origin, err := service.PasskeyOrigin(c.Request)
		if err != nil {
			fail(c, err)
			return
		}
		enabled, err := h.service.PasskeyStatus(c.Request.Context(), authhandler.CurrentUserID(c), origin)
		result(c, gin.H{"enabled": enabled}, err)
	})
	for _, kind := range []string{"register", "login"} {
		r.POST("/passkeys/"+kind+"/begin", func(c *gin.Context) {
			origin, err := service.PasskeyOrigin(c.Request)
			if err != nil {
				fail(c, err)
				return
			}
			var input struct {
				Password string `json:"password"`
			}
			if !bind(c, &input) {
				return
			}
			out, err := h.service.BeginPasskey(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c), origin, kind, input.Password)
			result(c, out, err)
		})
		r.POST("/passkeys/"+kind+"/finish", func(c *gin.Context) {
			origin, err := service.PasskeyOrigin(c.Request)
			if err != nil {
				fail(c, err)
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
			until, err := h.service.FinishPasskey(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c), origin, kind, c.Request)
			result(c, gin.H{"expiresAt": until}, err)
		})
	}
	r.POST("/passkeys/delete", func(c *gin.Context) {
		origin, err := service.PasskeyOrigin(c.Request)
		if err != nil {
			fail(c, err)
			return
		}
		var input struct {
			Password string `json:"password"`
		}
		if !bind(c, &input) {
			return
		}
		result(c, nil, h.service.DeletePasskey(c.Request.Context(), authhandler.CurrentUserID(c), origin, input.Password))
	})
}
