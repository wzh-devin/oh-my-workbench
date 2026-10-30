// 邮箱 HTTP 协议、参数边界与安全下载，复用现有会话。
package mail

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

	"github.com/devin/oh-my-workbench/api/internal/modules/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

// Handler translates authenticated HTTP requests; business rules stay in Service.
type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service: service} }
func mailError(c *gin.Context, err error) {
	if c.Writer.Written() {
		return
	}
	status := http.StatusServiceUnavailable
	switch {
	case errors.Is(err, ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, ErrConflict), errors.Is(err, ErrDuplicate):
		status = http.StatusConflict
	case errors.Is(err, ErrTooLarge):
		status = http.StatusRequestEntityTooLarge
	}
	message := "邮箱服务暂不可用，请重试"
	for _, known := range []error{ErrInvalid, ErrNotFound, ErrConflict, ErrDuplicate, ErrUnavailable, ErrNetwork, ErrDisabled, ErrPushDisabled, ErrTooLarge} {
		if errors.Is(err, known) {
			message = err.Error()
			break
		}
	}
	response.Fail(c, status, message)
}
func bind(c *gin.Context, input any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(input); err != nil {
		mailError(c, ErrInvalid)
		return false
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		mailError(c, ErrInvalid)
		return false
	}
	return true
}
func pathID(c *gin.Context) (int64, bool) {
	id, err := recordID(c.Param("id"))
	if err != nil {
		mailError(c, err)
		return 0, false
	}
	return id, true
}
func (h *Handler) Accounts(c *gin.Context) {
	out, err := h.service.accounts(c.Request.Context(), auth.CurrentUserID(c))
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}
func (h *Handler) SaveAccount(c *gin.Context) {
	var input AccountInput
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
	out, err := h.service.saveAccount(c.Request.Context(), auth.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}
func (h *Handler) Query(c *gin.Context) {
	var input QueryInput
	if !bind(c, &input) {
		return
	}
	out, err := h.service.query(c.Request.Context(), auth.CurrentUserID(c), input)
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
	out, err := h.service.openMessage(c.Request.Context(), auth.CurrentUserID(c), id)
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
	var input MessageChanges
	if !bind(c, &input) {
		return
	}
	if input.Version < 1 || input.Read == nil && input.Starred == nil && input.Archived == nil {
		mailError(c, ErrInvalid)
		return
	}
	out, err := h.service.repository.changeMessage(c.Request.Context(), auth.CurrentUserID(c), id, input)
	if err != nil {
		mailError(c, err)
		return
	}
	h.service.repository.changed(c.Request.Context(), auth.CurrentUserID(c))
	response.Success(c, out)
}
func (h *Handler) Sync(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	if h.service.cipher == nil {
		mailError(c, ErrDisabled)
		return
	}
	out, err := h.service.repository.enqueue(c.Request.Context(), auth.CurrentUserID(c), id, "manual")
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
	out, err := h.service.repository.job(c.Request.Context(), auth.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, out)
}
func (h *Handler) Overview(c *gin.Context) {
	out, err := h.service.overview(c.Request.Context(), auth.CurrentUserID(c))
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
	err := h.service.download(c.Request.Context(), auth.CurrentUserID(c), id, func(a Attachment, reader io.Reader) error {
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
	response.Success(c, gin.H{"publicKey": h.service.options.VAPIDPublicKey, "mailConfigured": h.service.cipher != nil})
}
func (h *Handler) Subscribe(c *gin.Context) {
	var input subscriptionInput
	if !bind(c, &input) {
		return
	}
	if err := h.service.subscribePush(c.Request.Context(), auth.CurrentUserID(c), input); err != nil {
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
		mailError(c, ErrInvalid)
		return
	}
	if err := h.service.repository.removeSubscription(c.Request.Context(), auth.CurrentUserID(c), input.Endpoint); err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, nil)
}
func (h *Handler) Notifications(c *gin.Context) {
	before := int64(0)
	if value := c.Query("before"); value != "" {
		id, err := recordID(value)
		if err != nil {
			mailError(c, err)
			return
		}
		before = id
	}
	out, err := h.service.repository.notifications(c.Request.Context(), auth.CurrentUserID(c), before)
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
		mailError(c, ErrInvalid)
		return
	}
	ids := []int64{}
	for _, value := range input.IDs {
		id, err := recordID(value)
		if err != nil {
			mailError(c, err)
			return
		}
		ids = append(ids, id)
	}
	if err := h.service.repository.readNotifications(c.Request.Context(), auth.CurrentUserID(c), ids, input.All); err != nil {
		mailError(c, err)
		return
	}
	h.service.repository.changed(c.Request.Context(), auth.CurrentUserID(c))
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
		mailError(c, ErrInvalid)
		return
	}
	if err := h.service.repository.setNotifications(c.Request.Context(), auth.CurrentUserID(c), *input.Enabled); err != nil {
		mailError(c, err)
		return
	}
	h.service.repository.changed(c.Request.Context(), auth.CurrentUserID(c))
	response.Success(c, nil)
}

// Events carries invalidations only; reconnect always reloads durable state instead of replaying toasts.
func (h *Handler) Events(c *gin.Context) {
	if h.service.repository.redis == nil {
		mailError(c, ErrUnavailable)
		return
	}
	subscriber := h.service.repository.subscribe(c.Request.Context(), auth.CurrentUserID(c))
	defer subscriber.Close()
	if _, err := subscriber.Receive(c.Request.Context()); err != nil {
		mailError(c, ErrUnavailable)
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("X-Accel-Buffering", "no")
	c.Header("Connection", "keep-alive")
	fmt.Fprint(c.Writer, "event: changed\ndata: {}\n\n")
	c.Writer.Flush()
	channel := subscriber.Channel()
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
	var input BulkInput
	if !bind(c, &input) {
		return
	}
	result, err := h.service.bulkMessages(c.Request.Context(), auth.CurrentUserID(c), input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, result)
}
