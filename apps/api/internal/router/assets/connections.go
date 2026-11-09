package assets

import (
	"github.com/gin-gonic/gin"

	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) connections(c *gin.Context) {
	value, err := h.service.Connections(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, mapSlice(value, fromConnection), err)
}

func (h *Router) saveConnection(c *gin.Context) {
	var input assetreq.SaveConnectionRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveConnection(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, fromConnection(value), err)
}

func (h *Router) testConnection(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.TestConnection(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, fromConnection(value), err)
}
