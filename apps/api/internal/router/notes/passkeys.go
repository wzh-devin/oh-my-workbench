package notes

import (
	"net/http"

	"github.com/gin-gonic/gin"

	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	noteresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/notes"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	noteservice "github.com/devin/oh-my-workbench/api/internal/service/notes"
)

func (h *Router) passkeys(r *gin.RouterGroup) {
	r.POST("/passkeys/status", func(c *gin.Context) {
		origin, err := noteservice.PasskeyOrigin(c.Request)
		if err != nil {
			fail(c, err)
			return
		}
		enabled, err := h.service.PasskeyStatus(c.Request.Context(), authrouter.CurrentUserID(c), origin)
		result(c, noteresp.PasskeyStateResponse{Enabled: enabled}, err)
	})
	for _, kind := range []string{"register", "login"} {
		r.POST("/passkeys/"+kind+"/begin", func(c *gin.Context) {
			origin, err := noteservice.PasskeyOrigin(c.Request)
			if err != nil {
				fail(c, err)
				return
			}
			var input notereq.PasswordRequest
			if !bind(c, &input) {
				return
			}
			out, err := h.service.BeginPasskey(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c), origin, kind, input.Password)
			result(c, out, err)
		})
		r.POST("/passkeys/"+kind+"/finish", func(c *gin.Context) {
			origin, err := noteservice.PasskeyOrigin(c.Request)
			if err != nil {
				fail(c, err)
				return
			}
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
			until, err := h.service.FinishPasskey(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c), origin, kind, c.Request)
			result(c, noteresp.UnlockResponse{ExpiresAt: until}, err)
		})
	}
	r.POST("/passkeys/delete", func(c *gin.Context) {
		origin, err := noteservice.PasskeyOrigin(c.Request)
		if err != nil {
			fail(c, err)
			return
		}
		var input notereq.PasswordRequest
		if !bind(c, &input) {
			return
		}
		result(c, nil, h.service.DeletePasskey(c.Request.Context(), authrouter.CurrentUserID(c), origin, input.Password))
	})
}
