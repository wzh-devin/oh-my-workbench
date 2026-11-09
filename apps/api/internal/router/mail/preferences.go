package mail

import (
	"github.com/gin-gonic/gin"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	mailresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/mail"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func (h *Router) Notifications(c *gin.Context) {
	before := int64(0)
	if value := c.Query("before"); value != "" {
		id, err := maildomain.ParseID(value)
		if err != nil {
			mailError(c, err)
			return
		}
		before = id
	}
	out, err := h.service.Notifications(c.Request.Context(), authrouter.CurrentUserID(c), before)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, mapSlice(out, fromNotificationView))
}

func (h *Router) ReadNotifications(c *gin.Context) {
	var input mailreq.ReadNotificationsRequest
	if !bind(c, &input) {
		return
	}
	if len(input.IDs) > 200 || !input.All && len(input.IDs) == 0 {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	ids := []int64{}
	for _, value := range input.IDs {
		id, err := maildomain.ParseID(value)
		if err != nil {
			mailError(c, err)
			return
		}
		ids = append(ids, id)
	}
	if err := h.service.ReadNotifications(c.Request.Context(), authrouter.CurrentUserID(c), ids, input.All); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Router) Preferences(c *gin.Context) {
	var input mailreq.PreferencesRequest
	if !bind(c, &input) {
		return
	}
	if input.Enabled == nil {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	if err := h.service.SetNotifications(c.Request.Context(), authrouter.CurrentUserID(c), *input.Enabled); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Router) GetPreferences(c *gin.Context) {
	enabled, err := h.service.NotificationPreferences(c.Request.Context(), authrouter.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, mailresp.NotificationPreferencesResponse{NotificationsEnabled: enabled})
}
