package handler

import (
	auth "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	d "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	"github.com/gin-gonic/gin"
)

// Page accepts the complete rule tree in JSON, without URL length limits.
func (h *Handler) Page(c *gin.Context) {
	input := d.QueryInput{PageNum: 1, PageSize: 10}
	if !read(c, &input) {
		return
	}
	value, err := h.service.Query(c.Request.Context(), auth.CurrentUserID(c), input)
	finish(c, value, err)
}
func (h *Handler) Lists(c *gin.Context) {
	value, err := h.service.Lists(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, value, err)
}
func (h *Handler) Views(c *gin.Context) {
	value, err := h.service.Views(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, value, err)
}
func (h *Handler) Priorities(c *gin.Context) {
	value, err := h.service.Priorities(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, value, err)
}
func (h *Handler) Counts(c *gin.Context) {
	value, err := h.service.Counts(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, value, err)
}
func (h *Handler) Task(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Task(c.Request.Context(), auth.CurrentUserID(c), id)
	finish(c, value, err)
}
