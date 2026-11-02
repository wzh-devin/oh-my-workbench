package handler

import (
	auth "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	"github.com/gin-gonic/gin"
)

func (h *Handler) directories(c *gin.Context) {
	v, e := h.service.Directories(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, v, e)
}
func (h *Handler) statistics(c *gin.Context) {
	v, e := h.service.Statistics(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, v, e)
}
