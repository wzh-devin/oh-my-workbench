package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	maildomain "github.com/devin/oh-my-workbench/api/internal/modules/mail/domain"
	mailservice "github.com/devin/oh-my-workbench/api/internal/modules/mail/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

// 邮箱 HTTP 协议、参数边界与安全下载，复用现有会话。
// Handler translates authenticated HTTP requests; business rules stay in Service.
type Handler struct{ service *mailservice.Service }

func NewHandler(service *mailservice.Service) *Handler { return &Handler{service: service} }

func mailError(c *gin.Context, err error) {
	if c.Writer.Written() {
		logging.Error(c.Request.Context(), "mail.stream_failed", err)
		return
	}
	status := http.StatusServiceUnavailable
	switch {
	case errors.Is(err, maildomain.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, maildomain.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, maildomain.ErrConflict), errors.Is(err, maildomain.ErrDuplicate):
		status = http.StatusConflict
	case errors.Is(err, maildomain.ErrTooLarge):
		status = http.StatusRequestEntityTooLarge
	}
	message := "邮箱服务暂不可用，请重试"
	for _, known := range []error{maildomain.ErrInvalid, maildomain.ErrNotFound, maildomain.ErrConflict, maildomain.ErrDuplicate, maildomain.ErrUnavailable, maildomain.ErrNetwork, maildomain.ErrDisabled, maildomain.ErrPushDisabled, maildomain.ErrTooLarge} {
		if errors.Is(err, known) {
			message = err.Error()
			break
		}
	}
	if status >= 500 {
		logging.Error(c.Request.Context(), "mail.failed", err)
	}
	response.Fail(c, status, message)
}

func bind(c *gin.Context, input any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(input); err != nil {
		mailError(c, maildomain.ErrInvalid)
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		mailError(c, maildomain.ErrInvalid)
		return false
	}
	return true
}

func pathID(c *gin.Context) (int64, bool) {
	id, err := maildomain.ParseID(c.Param("id"))
	if err != nil {
		mailError(c, err)
		return 0, false
	}
	return id, true
}

func (h *Handler) Accounts(c *gin.Context) {
	out, err := h.service.Accounts(c.Request.Context(), authhandler.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) SaveAccount(c *gin.Context) {
	var input maildomain.AccountInput
	if !bind(c, &input) {
		return
	}
	var id int64
	if c.Param("id") != "" {
		value, ok := pathID(c)
		if !ok {
			return
		}
		id = value
	}
	out, err := h.service.SaveAccount(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) Query(c *gin.Context) {
	var input maildomain.QueryInput
	if !bind(c, &input) {
		return
	}
	out, err := h.service.Query(c.Request.Context(), authhandler.CurrentUserID(c), input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) Message(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.OpenMessage(c.Request.Context(), authhandler.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) ChangeMessage(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	var input maildomain.MessageChanges
	if !bind(c, &input) {
		return
	}
	if input.Version < 1 || input.Read == nil && input.Starred == nil && input.Archived == nil {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	out, err := h.service.ChangeMessage(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) Sync(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.Sync(c.Request.Context(), authhandler.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, response.ApiResult{Code: 0, Message: "success", Data: out})
}

func (h *Handler) Job(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.Job(c.Request.Context(), authhandler.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) Overview(c *gin.Context) {
	out, err := h.service.Overview(c.Request.Context(), authhandler.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

// Download sends safe attachment headers only after authentication and remote lookup succeed.
func (h *Handler) Download(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	err := h.service.Download(c.Request.Context(), authhandler.CurrentUserID(c), id, func(a maildomain.Attachment, reader io.Reader) error {
		name := strings.ReplaceAll(path.Base(strings.ReplaceAll(a.Filename, "\\", "/")), "\x00", "")
		c.Header("Content-Type", "application/octet-stream")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
		_, err := io.Copy(c.Writer, reader)
		return err
	})
	if err != nil {
		if c.Writer.Written() {
			_ = c.Error(err)
			return
		}
		mailError(c, err)
	}
}

func (h *Handler) PushConfig(c *gin.Context) {
	publicKey, configured, err := h.service.PushConfig(c.Request.Context())
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, gin.H{"publicKey": publicKey, "mailConfigured": configured})
}

func (h *Handler) Subscribe(c *gin.Context) {
	var input mailservice.SubscriptionInput
	if !bind(c, &input) {
		return
	}
	if err := h.service.SubscribePush(c.Request.Context(), authhandler.CurrentUserID(c), input); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Handler) Unsubscribe(c *gin.Context) {
	var input struct {
		Endpoint string `json:"endpoint"`
	}
	if !bind(c, &input) {
		return
	}
	if input.Endpoint == "" || len(input.Endpoint) > 4096 {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	if err := h.service.RemoveSubscription(c.Request.Context(), authhandler.CurrentUserID(c), input.Endpoint); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Handler) Notifications(c *gin.Context) {
	before := int64(0)
	if value := c.Query("before"); value != "" {
		id, err := maildomain.ParseID(value)
		if err != nil {
			mailError(c, err)
			return
		}
		before = id
	}
	out, err := h.service.Notifications(c.Request.Context(), authhandler.CurrentUserID(c), before)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}

func (h *Handler) ReadNotifications(c *gin.Context) {
	var input struct {
		IDs []string `json:"ids"`
		All bool     `json:"all"`
	}
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
	if err := h.service.ReadNotifications(c.Request.Context(), authhandler.CurrentUserID(c), ids, input.All); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *Handler) Preferences(c *gin.Context) {
	var input struct {
		Enabled *bool `json:"enabled"`
	}
	if !bind(c, &input) {
		return
	}
	if input.Enabled == nil {
		mailError(c, maildomain.ErrInvalid)
		return
	}
	if err := h.service.SetNotifications(c.Request.Context(), authhandler.CurrentUserID(c), *input.Enabled); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}

// Events carries invalidations only; reconnect always reloads durable state instead of replaying toasts.
func (h *Handler) Events(c *gin.Context) {
	channel, closeSubscription, err := h.service.SubscribeEvents(c.Request.Context(), authhandler.CurrentUserID(c))
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

// BulkMessages 按已验证的列表范围执行集合更新，返回实际修改数量。
func (h *Handler) BulkMessages(c *gin.Context) {
	var input maildomain.BulkInput
	if !bind(c, &input) {
		return
	}
	result, err := h.service.BulkMessages(c.Request.Context(), authhandler.CurrentUserID(c), input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, result)
}
