package todos

import (
	"github.com/gin-gonic/gin"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

// Page accepts the complete rule tree in JSON, without URL length limits.
func (h *Router) Page(c *gin.Context) {
	input := todoreq.TaskPageRequest{PageNum: 1, PageSize: 10}
	if !read(c, &input) {
		return
	}
	value, err := h.service.Query(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, value, err)
}

func (h *Router) Lists(c *gin.Context) {
	value, err := h.service.Lists(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Router) Views(c *gin.Context) {
	value, err := h.service.Views(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Router) Priorities(c *gin.Context) {
	value, err := h.service.Priorities(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Router) Counts(c *gin.Context) {
	value, err := h.service.Counts(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Router) Task(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Task(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, value, err)
}
