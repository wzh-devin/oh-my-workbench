package assets

import (
	"github.com/gin-gonic/gin"

	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) views(c *gin.Context) {
	value, err := h.service.Views(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, mapSlice(value, fromView), err)
}

func (h *Router) saveView(c *gin.Context) {
	var input assetreq.SaveViewRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveView(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, fromView(value), err)
}

func (h *Router) deleteViews(c *gin.Context) {
	var input assetreq.DeleteViewsRequest
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.DeleteViews(c.Request.Context(), authrouter.CurrentUserID(c), input.Items))
}
