package handler

import (
	"encoding/json"
	"errors"
	auth "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	d "github.com/devin/oh-my-workbench/api/internal/modules/workbench/domain"
	s "github.com/devin/oh-my-workbench/api/internal/modules/workbench/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"strconv"
)

type Handler struct{ service *s.Service }

func NewHandler(service *s.Service) *Handler { return &Handler{service} }
func finish(c *gin.Context, v any, e error) {
	if e == nil {
		response.Success(c, v)
		return
	}
	if errors.Is(e, d.ErrInvalid) {
		response.Fail(c, 400, e.Error())
		return
	}
	logging.Error(c.Request.Context(), "workbench.failed", e)
	response.Fail(c, 503, "工作台数据暂不可用，请重试")
}
func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/statistics", h.statistics)
	r.GET("/issues", h.issues)
	r.GET("/records/page", h.records)
	r.POST("/notifications/page", h.notifications)
	r.POST("/notifications/readAll", h.readAll)
}
func (h *Handler) statistics(c *gin.Context) {
	v, e := h.service.Statistics(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, v, e)
}
func (h *Handler) issues(c *gin.Context) {
	v, e := h.service.Issues(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, v, e)
}
func (h *Handler) records(c *gin.Context) {
	p, ep := strconv.Atoi(c.DefaultQuery("pageNum", "1"))
	n, en := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if ep != nil || en != nil {
		finish(c, nil, d.ErrInvalid)
		return
	}
	v, e := h.service.Records(c.Request.Context(), auth.CurrentUserID(c), d.PageInput{PageNum: p, PageSize: n, Kind: c.DefaultQuery("kind", "all"), Search: c.Query("search"), Sort: c.DefaultQuery("sort", "timestamp:desc")})
	finish(c, v, e)
}
func (h *Handler) notifications(c *gin.Context) {
	var input d.PageInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, d.ErrInvalid)
		return
	}
	v, e := h.service.Notifications(c.Request.Context(), auth.CurrentUserID(c), input)
	finish(c, v, e)
}

func (h *Handler) readAll(c *gin.Context) {
	var input d.PageInput
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, d.ErrInvalid)
		return
	}
	finish(c, nil, h.service.ReadAll(c.Request.Context(), auth.CurrentUserID(c), input))
}
