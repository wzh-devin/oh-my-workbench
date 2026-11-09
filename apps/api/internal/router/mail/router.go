package mail

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"

	maildomain "github.com/devin/oh-my-workbench/api/internal/domain/mail"
	mailreq "github.com/devin/oh-my-workbench/api/internal/domain/req/mail"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	mailservice "github.com/devin/oh-my-workbench/api/internal/service/mail"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Router struct{ service *mailservice.Service }

func NewRouter(service *mailservice.Service) *Router { return &Router{service: service} }

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
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
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

func (h *Router) Job(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	out, err := h.service.Job(c.Request.Context(), authrouter.CurrentUserID(c), id)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromSyncJob(out))
}

func (h *Router) Download(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		return
	}
	err := h.service.Download(c.Request.Context(), authrouter.CurrentUserID(c), id, func(a repository.MailAttachment, reader io.Reader) error {
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

// BulkMessages 按已验证的列表范围执行集合更新，返回实际修改数量。
func (h *Router) BulkMessages(c *gin.Context) {
	var input mailreq.BulkMessagesRequest
	if !bind(c, &input) {
		return
	}
	result, err := h.service.BulkMessages(c.Request.Context(), authrouter.CurrentUserID(c), input)
	if err != nil {
		mailError(c, err)
		return
	}
	response.Success(c, fromBulkResult(result))
}

func mutationID(c *gin.Context, value string) (int64, bool) {
	if strings.HasSuffix(c.FullPath(), "/save") {
		if value != "" {
			mailError(c, maildomain.ErrInvalid)
			return 0, false
		}
		return 0, true
	}
	id, e := maildomain.ParseID(value)
	if e != nil {
		mailError(c, e)
		return 0, false
	}
	return id, true
}

// 挂载邮箱模块路由，调用方统一安装登录校验。
// RegisterRoutes mounts the mailbox contract under the existing session middleware.
func (h *Router) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/accounts", h.Accounts)
	r.POST("/accounts/save", h.SaveAccount)
	r.POST("/accounts/update", h.SaveAccount)
	r.POST("/accounts/:id/sync", h.Sync)
	r.GET("/sync-jobs/:id", h.Job)
	r.POST("/messages/page", h.Page)
	r.POST("/messages/bulk", h.BulkMessages)
	r.GET("/messages/:id", h.Message)
	r.POST("/messages/update", h.ChangeMessage)
	r.GET("/attachments/:id/download", h.Download)
	r.GET("/events", h.Events)
	r.GET("/push/config", h.PushConfig)
	r.POST("/push/subscriptions", h.Subscribe)
	r.DELETE("/push/subscriptions", h.Unsubscribe)
	r.GET("/notifications", h.Notifications)
	r.PATCH("/notifications/read", h.ReadNotifications)
	r.GET("/preferences", h.GetPreferences)
	r.PUT("/preferences", h.Preferences)
}
