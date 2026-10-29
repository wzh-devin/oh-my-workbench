package todos

import (
	"github.com/devin/oh-my-workbench/api/internal/modules/auth"
	"github.com/gin-gonic/gin"
)

func (h *Handler) CreateView(c *gin.Context) { h.saveView(c, 0) }
func (h *Handler) UpdateView(c *gin.Context) {
	if id, ok := routeID(c); ok {
		h.saveView(c, id)
	}
}
func (h *Handler) saveView(c *gin.Context, id int64) {
	var input ViewRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SaveView(c.Request.Context(), auth.CurrentUserID(c), id, input)
	finish(c, result, err)
}
func (h *Handler) DeleteView(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	var input DeleteRequest
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.DeleteView(c.Request.Context(), auth.CurrentUserID(c), id, input.Version))
}
func (h *Handler) SavePriorities(c *gin.Context) {
	var input PrioritiesRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SavePriorities(c.Request.Context(), auth.CurrentUserID(c), input)
	finish(c, result, err)
}
