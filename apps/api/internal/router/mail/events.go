package mail

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

// Events carries invalidations only; reconnect always reloads durable state instead of replaying toasts.
func (h *Router) Events(c *gin.Context) {
	channel, closeSubscription, err := h.service.SubscribeEvents(c.Request.Context(), authrouter.CurrentUserID(c))
	if err != nil {
		mailError(c, maildomain.ErrUnavailable)
		return
	}
	defer closeSubscription()
	c.Header("Content-Type", "text/event-stream")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Connection", "keep-alive")
	fmt.Fprint(c.Writer, "event: changed\ndata: {}\n\n")
	c.Writer.Flush()
	timer := time.NewTicker(20 * time.Second)
	defer timer.Stop()
	// Re-authentication on reconnect bounds idle SSE authorization to one minute.
	expiry := time.NewTimer(time.Minute)
	defer expiry.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case <-expiry.C:
			return
		case _, ok := <-channel:
			if !ok {
				return
			}
			fmt.Fprint(c.Writer, "event: changed\ndata: {}\n\n")
			c.Writer.Flush()
		case <-timer.C:
			fmt.Fprint(c.Writer, ": heartbeat\n\n")
			c.Writer.Flush()
		}
	}
}
