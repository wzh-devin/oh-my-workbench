package todos

import (
	"errors"

	"github.com/gin-gonic/gin"

	tododomain "github.com/devin/oh-my-workbench/api/internal/domain/todos"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	todoservice "github.com/devin/oh-my-workbench/api/internal/service/todos"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Router struct{ service *todoservice.Service }

func NewRouter(service *todoservice.Service) *Router { return &Router{service} }

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

func finish(c *gin.Context, value any, err error) {
	if err != nil {
		fail(c, err)
	} else {
		response.Success(c, value)
	}
}

func (h *Router) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/lists", h.Lists)
	r.GET("/views", h.Views)
	r.GET("/priorities", h.Priorities)
	r.GET("/counts", h.Counts)
	r.POST("/tasks/page", h.Page)
	r.GET("/tasks/:id", h.Task)
	r.POST("/import", h.Import)
	r.POST("/priorities/update", h.SavePriorities)
	r.POST("/views/save", h.SaveView)
	r.POST("/views/update", h.SaveView)
	r.POST("/views/deleteBatch", h.DeleteBatch)
	r.POST("/lists/save", h.SaveList)
	r.POST("/lists/update", h.SaveList)
	r.POST("/lists/deleteBatch", h.DeleteBatch)
	r.POST("/tasks/save", h.SaveTask)
	r.POST("/tasks/update", h.SaveTask)
	r.POST("/tasks/deleteBatch", h.DeleteBatch)
}
