package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	authservice "github.com/devin/oh-my-workbench/api/internal/modules/auth/service"
	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/modules/settings/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type SystemHandler struct {
	service *settingsservice.SystemService
}

func NewSystemHandler(service *settingsservice.SystemService) *SystemHandler {
	return &SystemHandler{service: service}
}

// 系统配置只允许真实管理员会话访问，普通设置接口不提供密钥入口。
func (h *SystemHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.Use(func(c *gin.Context) {
		if !c.MustGet("auth.session").(authservice.Session).User.IsAdmin {
			response.Fail(c, http.StatusForbidden, "仅管理员可管理系统配置")
			c.Abort()
			return
		}
		c.Next()
	})
	group.GET("", h.get)
	group.PUT("", h.save)
}

func systemResult(c *gin.Context, view settingsdomain.SystemView, err error) {
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

func (h *SystemHandler) get(c *gin.Context) {
	view, err := h.service.View(c.Request.Context())
	systemResult(c, view, err)
}

func (h *SystemHandler) save(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	var input struct {
		ConverterURL *string `json:"converterUrl"`
		PushSubject  *string `json:"pushSubject"`
		Version      *int    `json:"version"`
	}
	if decoder.Decode(&input) != nil || input.ConverterURL == nil || input.PushSubject == nil || input.Version == nil || decoder.Decode(new(any)) != io.EOF {
		systemResult(c, settingsdomain.SystemView{}, settingsdomain.ErrSystemInvalid)
		return
	}
	view, err := h.service.Save(c.Request.Context(), settingsdomain.SystemView{ConverterURL: *input.ConverterURL, PushSubject: *input.PushSubject, Version: *input.Version})
	systemResult(c, view, err)
}
