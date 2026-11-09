package assets

import (
	"github.com/gin-gonic/gin"

	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) directories(c *gin.Context) {
	v, e := h.service.Directories(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, mapSlice(v, fromEntry), e)
}
