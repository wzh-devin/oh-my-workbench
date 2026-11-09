package mail

import (
	"github.com/gin-gonic/gin"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	mailresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/mail"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func (h *Router) PushConfig(c *gin.Context) {
	publicKey, configured, err := h.service.PushConfig(c.Request.Context())
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, mailresp.PushConfigResponse{PublicKey: publicKey, MailConfigured: configured})
}

func (h *Router) Subscribe(c *gin.Context) {
	var input mailreq.SubscribePushRequest
	if !bind(c, &input) {
		return
	}
	if err := h.service.SubscribePush(c.Request.Context(), authrouter.CurrentUserID(c), input); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Router) Unsubscribe(c *gin.Context) {
	var input mailreq.UnsubscribeRequest
	if !bind(c, &input) {
		return
	}
	if input.Endpoint == "" || len(input.Endpoint) > 4096 {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	if err := h.service.RemoveSubscription(c.Request.Context(), authrouter.CurrentUserID(c), input.Endpoint); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}
