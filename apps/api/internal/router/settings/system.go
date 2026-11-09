package settings

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	settingsreq "github.com/devin/oh-my-workbench/api/internal/domain/req/settings"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	settingsresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/settings"
	settingsdomain "github.com/devin/oh-my-workbench/api/internal/domain/settings"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/service/settings"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type SystemRouter struct {
	service *settingsservice.SystemService
}

func NewSystemRouter(service *settingsservice.SystemService) *SystemRouter {
	return &SystemRouter{service: service}
}

// 系统配置只允许真实管理员会话访问，普通设置接口不提供密钥入口。
func (h *SystemRouter) RegisterRoutes(group *gin.RouterGroup) {
	group.Use(func(c *gin.Context) {
		if !c.MustGet("auth.session").(authresp.SessionResponse).User.IsAdmin {
			response.Fail(c, http.StatusForbidden, "仅管理员可管理系统配置")
			c.Abort()
			return
		}
		c.Next()
	})
	group.GET("", h.get)
	group.PUT("", h.save)
}

func systemResult(c *gin.Context, view settingsresp.SystemSettingsResponse, err error) {
	if err == nil {
		response.Success(c, view)
		return
	}
	status, message := http.StatusServiceUnavailable, settingsdomain.ErrSystemUnavailable.Error()
	if errors.Is(err, settingsdomain.ErrSystemInvalid) {
		status, message = http.StatusBadRequest, err.Error()
	}
	if errors.Is(err, settingsdomain.ErrConflict) {
		status, message = http.StatusConflict, err.Error()
	}
	if status >= 500 {
		logging.Error(c.Request.Context(), "settings.failed", err)
	}
	response.Fail(c, status, message)
}

func (h *SystemRouter) get(c *gin.Context) {
	view, err := h.service.View(c.Request.Context())
	systemResult(c, view, err)
}

func (h *SystemRouter) save(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	var input settingsreq.SystemSaveRequest
	if decoder.Decode(&input) != nil || input.ConverterURL == nil || input.PushSubject == nil || input.Version == nil || decoder.Decode(new(any)) != io.EOF {
		systemResult(c, settingsresp.SystemSettingsResponse{}, settingsdomain.ErrSystemInvalid)
		return
	}
	view, err := h.service.Save(c.Request.Context(), settingsreq.SystemSettingsRequest{ConverterURL: *input.ConverterURL, PushSubject: *input.PushSubject, Version: *input.Version})
	systemResult(c, view, err)
}
