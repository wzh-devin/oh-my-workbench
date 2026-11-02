package handler

import (
	auth "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

func (h *Handler) GetPreferences(c *gin.Context) {
	enabled, err := h.service.NotificationPreferences(c.Request.Context(), auth.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, gin.H{"notificationsEnabled": enabled})
}
