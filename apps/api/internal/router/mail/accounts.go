package mail

import (
	"github.com/gin-gonic/gin"

	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func (h *Router) Accounts(c *gin.Context) {
	out, err := h.service.Accounts(c.Request.Context(), authrouter.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, mapSlice(out, fromAccountView))
}

func (h *Router) SaveAccount(c *gin.Context) {
	var input mailreq.SaveAccountRequest
	if !bind(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	out, err := h.service.SaveAccount(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromAccountView(out))
}
