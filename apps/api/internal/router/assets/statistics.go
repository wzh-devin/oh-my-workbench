package assets

import (
	"github.com/gin-gonic/gin"

	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) statistics(c *gin.Context) {
	v, e := h.service.Statistics(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, fromStatistics(v), e)
}
