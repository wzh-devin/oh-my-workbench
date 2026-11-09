package mail

import (
	"net/http"

	"github.com/gin-gonic/gin"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func (h *Router) Page(c *gin.Context) {
	input := mailreq.MessagePageRequest{Page: 1, PageSize: 10}
	if !bind(c, &input) {
		return
	}
	if input.Page < 1 {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	out, err := h.service.Query(c.Request.Context(), authrouter.CurrentUserID(c), input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromQueryResult(out))
}

func (h *Router) Message(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.OpenMessage(c.Request.Context(), authrouter.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromMessageView(out))
}

func (h *Router) ChangeMessage(c *gin.Context) {
	var input mailreq.UpdateMessageRequest
	if !bind(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	if input.Version < 1 || input.Read == nil && input.Starred == nil && input.Archived == nil {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	out, err := h.service.ChangeMessage(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromMessage(out))
}

func (h *Router) Sync(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.Sync(c.Request.Context(), authrouter.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, response.ApiResult{Code: 0, Message: "success", Data: fromSyncJob(out)})
}
