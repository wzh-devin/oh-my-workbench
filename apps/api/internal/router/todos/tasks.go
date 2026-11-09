package todos

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	todoreq "github.com/devin/oh-my-workbench/api/internal/domain/req/todos"
	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

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

func (h *Router) SaveList(c *gin.Context) {
	var input todoreq.ListRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveList(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Router) SaveTask(c *gin.Context) {
	var input todoreq.TaskRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	result, err := h.service.SaveTask(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, result, err)
}

func (h *Router) Import(c *gin.Context) {
	var input todoreq.ImportRequest
	if !read(c, &input) {
		return
	}
	result, err := h.service.Import(c.Request.Context(), authrouter.CurrentUserID(c), input)
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

func (h *Router) DeleteBatch(c *gin.Context) {
	var input todoreq.BatchRequest
	if !read(c, &input) {
		return
	}
	resource := strings.Split(strings.Trim(c.FullPath(), "/"), "/")
	finish(c, nil, h.service.DeleteBatch(c.Request.Context(), authrouter.CurrentUserID(c), resource[len(resource)-2], input.Items))
}
