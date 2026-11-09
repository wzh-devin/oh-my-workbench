package todos

import (
	"github.com/gin-gonic/gin"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) SaveView(c *gin.Context) {
	var input todoreq.ViewRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveView(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Router) SavePriorities(c *gin.Context) {
	var input todoreq.PrioritiesRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SavePriorities(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, result, err)
}
