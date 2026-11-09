package workbench

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	workbenchreq "github.com/devin/oh-my-workbench/api/internal/domain/req/workbench"
	workbenchdomain "github.com/devin/oh-my-workbench/api/internal/domain/workbench"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	workbenchservice "github.com/devin/oh-my-workbench/api/internal/service/workbench"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Router struct{ service *workbenchservice.Service }

func NewRouter(service *workbenchservice.Service) *Router { return &Router{service} }

func finish(c *gin.Context, v any, e error) {
	if e == nil {
		response.Success(c, v)
		return
	}
	if errors.Is(e, workbenchdomain.ErrInvalid) {
		response.Fail(c, 400, e.Error())
		return
	}
	logging.Error(c.Request.Context(), "workbench.failed", e)
	response.Fail(c, 503, "工作台数据暂不可用，请重试")
}

func (h *Router) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/statistics", h.statistics)
	r.GET("/issues", h.issues)
	r.GET("/records/page", h.records)
	r.POST("/notifications/page", h.notifications)
	r.POST("/notifications/readAll", h.readAll)
}

func (h *Router) statistics(c *gin.Context) {
	v, e := h.service.Statistics(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, v, e)
}

func (h *Router) issues(c *gin.Context) {
	v, e := h.service.Issues(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, v, e)
}

func (h *Router) records(c *gin.Context) {
	p, ep := strconv.Atoi(c.DefaultQuery("pageNum", "1"))
	n, en := strconv.Atoi(c.DefaultQuery("pageSize", "10"))
	if ep != nil || en != nil {
		finish(c, nil, workbenchdomain.ErrInvalid)
		return
	}
	v, e := h.service.Records(c.Request.Context(), authrouter.CurrentUserID(c), workbenchreq.RecordPageRequest{PageNum: p, PageSize: n, Kind: c.DefaultQuery("kind", "all"), Search: c.Query("search"), Sort: c.DefaultQuery("sort", "timestamp:desc")})
	finish(c, v, e)
}

func (h *Router) notifications(c *gin.Context) {
	var input workbenchreq.RecordPageRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2<<20)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, workbenchdomain.ErrInvalid)
		return
	}
	v, e := h.service.Notifications(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, v, e)
}

func (h *Router) readAll(c *gin.Context) {
	var input workbenchreq.RecordPageRequest
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF {
		finish(c, nil, workbenchdomain.ErrInvalid)
		return
	}
	finish(c, nil, h.service.ReadAll(c.Request.Context(), authrouter.CurrentUserID(c), input))
}
