package handler

import (
	"github.com/gin-gonic/gin"

	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
)

func (h *Handler) SaveView(c *gin.Context) {
	var input tododomain.ViewRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveView(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Handler) SavePriorities(c *gin.Context) {
	var input tododomain.PrioritiesRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SavePriorities(c.Request.Context(), authhandler.CurrentUserID(c), input)
	finish(c, result, err)
}
