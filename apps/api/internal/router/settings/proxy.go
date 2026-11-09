package settings

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	settingsreq "github.com/devin/oh-my-workbench/api/internal/domain/req/settings"
	settingsdomain "github.com/devin/oh-my-workbench/api/internal/domain/settings"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/service/settings"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type ProxyRouter struct{ service *settingsservice.ProxyService }

func NewProxyRouter(service *settingsservice.ProxyService) *ProxyRouter {
	return &ProxyRouter{service: service}
}

func (h *ProxyRouter) RegisterRoutes(group *gin.RouterGroup) {
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

func (h *ProxyRouter) list(c *gin.Context) {
	out, err := h.service.List(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, out, err)
}

func (h *ProxyRouter) save(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	var input settingsreq.ProxySaveRequest
	if decoder.Decode(&input) != nil || input.ProxyURL == nil || input.Version == nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, settingsdomain.ErrInvalid)
		return
	}
	out, err := h.service.Save(c.Request.Context(), authrouter.CurrentUserID(c), c.Param("service"), settingsreq.ProxySettingsRequest{ProxyURL: *input.ProxyURL, Version: *input.Version})
	finish(c, out, err)
}
