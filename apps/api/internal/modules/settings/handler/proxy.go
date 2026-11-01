package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	settingsdomain "github.com/devin/oh-my-workbench/api/internal/modules/settings/domain"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/modules/settings/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type ProxyHandler struct{ service *settingsservice.ProxyService }

func NewProxyHandler(service *settingsservice.ProxyService) *ProxyHandler {
	return &ProxyHandler{service: service}
}

func (h *ProxyHandler) RegisterRoutes(group *gin.RouterGroup) {
	group.GET("", h.list)
	group.PUT("/:service", h.save)
}

func finish(c *gin.Context, out any, err error) {
	if err == nil {
		response.Success(c, out)
		return
	}
	status, message := http.StatusServiceUnavailable, "代理设置暂不可用，请重试"
	if errors.Is(err, settingsdomain.ErrInvalid) {
		status, message = http.StatusBadRequest, settingsdomain.ErrInvalid.Error()
	}
	if errors.Is(err, settingsdomain.ErrConflict) {
		status, message = http.StatusConflict, settingsdomain.ErrConflict.Error()
	}
	if status >= 500 {
		logging.Error(c.Request.Context(), "settings.failed", err)
	}
	response.Fail(c, status, message)
}

func (h *ProxyHandler) list(c *gin.Context) {
	out, err := h.service.List(c.Request.Context(), authhandler.CurrentUserID(c))
	finish(c, out, err)
}

func (h *ProxyHandler) save(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	var input struct {
		ProxyURL *string `json:"proxyUrl"`
		Version  *int    `json:"version"`
	}
	if decoder.Decode(&input) != nil || input.ProxyURL == nil || input.Version == nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, settingsdomain.ErrInvalid)
		return
	}
	out, err := h.service.Save(c.Request.Context(), authhandler.CurrentUserID(c), c.Param("service"), settingsdomain.Input{ProxyURL: *input.ProxyURL, Version: *input.Version})
	finish(c, out, err)
}
