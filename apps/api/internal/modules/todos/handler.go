package todos

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/devin/oh-my-workbench/api/internal/modules/auth"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service *Service }

func NewHandler(service *Service) *Handler { return &Handler{service} }
func fail(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalid), errors.Is(err, ErrRule):
		response.Fail(c, 400, err.Error())
	case errors.Is(err, ErrNotFound):
		response.Fail(c, 404, err.Error())
	case errors.Is(err, ErrConflict), errors.Is(err, ErrListName), errors.Is(err, ErrViewName), errors.Is(err, ErrLastView), errors.Is(err, ErrViewLimit):
		response.Fail(c, 409, err.Error())
	default:
		log.Printf("待办服务失败: %v", err)
		response.Fail(c, 503, "待办服务暂不可用，请重试")
	}
}
func read(c *gin.Context, input any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<20)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(new(any)) != io.EOF {
		fail(c, ErrInvalid)
		return false
	}
	return true
}
func routeID(c *gin.Context) (int64, bool) {
	id, err := parseID(c.Param("id"))
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
func (h *Handler) Snapshot(c *gin.Context) {
	result, err := h.service.Snapshot(c.Request.Context(), auth.CurrentUserID(c))
	finish(c, result, err)
}
func (h *Handler) CreateList(c *gin.Context) { h.saveList(c, 0) }
func (h *Handler) UpdateList(c *gin.Context) {
	if id, ok := routeID(c); ok {
		h.saveList(c, id)
	}
}
func (h *Handler) saveList(c *gin.Context, id int64) {
	var input ListRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SaveList(c.Request.Context(), auth.CurrentUserID(c), id, input)
	finish(c, result, err)
}
func (h *Handler) DeleteList(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	result, err := h.service.DeleteList(c.Request.Context(), auth.CurrentUserID(c), id)
	finish(c, result, err)
}
func (h *Handler) CreateTask(c *gin.Context) { h.saveTask(c, 0) }
func (h *Handler) UpdateTask(c *gin.Context) {
	if id, ok := routeID(c); ok {
		h.saveTask(c, id)
	}
}
func (h *Handler) saveTask(c *gin.Context, id int64) {
	var input TaskRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.SaveTask(c.Request.Context(), auth.CurrentUserID(c), id, input)
	finish(c, result, err)
}
func (h *Handler) DeleteTask(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	var input DeleteRequest
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.DeleteTask(c.Request.Context(), auth.CurrentUserID(c), id, input.Version))
}
func (h *Handler) Import(c *gin.Context) {
	var input ImportRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.Import(c.Request.Context(), auth.CurrentUserID(c), input)
	finish(c, result, err)
}
