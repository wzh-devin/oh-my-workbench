package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	tododomain "github.com/devin/oh-my-workbench/api/internal/modules/todos/domain"
	todoservice "github.com/devin/oh-my-workbench/api/internal/modules/todos/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Handler struct{ service *todoservice.Service }

func NewHandler(service *todoservice.Service) *Handler { return &Handler{service} }

func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, tododomain.ErrInvalid), errors.Is(err, tododomain.ErrRule):
		response.Fail(c, 400, err.Error())
	case errors.Is(err, tododomain.ErrNotFound):
		response.Fail(c, 404, err.Error())
	case errors.Is(err, tododomain.ErrConflict), errors.Is(err, tododomain.ErrListName), errors.Is(err, tododomain.ErrViewName), errors.Is(err, tododomain.ErrLastView), errors.Is(err, tododomain.ErrViewLimit):
		response.Fail(c, 409, err.Error())
	default:
		logging.Error(c.Request.Context(), "todos.failed", err)
		response.Fail(c, 503, "待办服务暂不可用，请重试")
	}
}

func read(c *gin.Context, input any) bool {
	limit := int64(64 << 10)
	if c.FullPath() == "/api/todos/import" {
		limit = 16 << 20
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(new(any)) != io.EOF {
		fail(c, tododomain.ErrInvalid)
		return false
	}
	return true
}

func routeID(c *gin.Context) (int64, bool) {
	id, err := tododomain.ParseID(c.Param("id"))
	if err != nil {
		fail(c, err)
		return 0, false
	}
	return id, true
}

func finish(c *gin.Context, value any, err error) {
	if err != nil {
		fail(c, err)
	} else {
		response.Success(c, value)
	}
}

func (h *Handler) SaveList(c *gin.Context) {
	var input tododomain.ListRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveList(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Handler) SaveTask(c *gin.Context) {
	var input tododomain.TaskRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveTask(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Handler) Import(c *gin.Context) {
	var input tododomain.ImportRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.Import(c.Request.Context(), authhandler.CurrentUserID(c), input)
	finish(c, result, err)
}

// mutationID prevents an update from accidentally creating a new resource.
func mutationID(c *gin.Context, value string) (int64, bool) {
	if strings.HasSuffix(c.FullPath(), "/save") {
		if value != "" {
			fail(c, tododomain.ErrInvalid)
			return 0, false
		}
		return 0, true
	}
	id, e := tododomain.ParseID(value)
	if e != nil {
		fail(c, e)
		return 0, false
	}
	return id, true
}
func (h *Handler) DeleteBatch(c *gin.Context) {
	var input tododomain.BatchRequest
	if !read(c, &input) {
		return
	}
	resource := strings.Split(strings.Trim(c.FullPath(), "/"), "/")
	finish(c, nil, h.service.DeleteBatch(c.Request.Context(), authhandler.CurrentUserID(c), resource[len(resource)-2], input.Items))
}
