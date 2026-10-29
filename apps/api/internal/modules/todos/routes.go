package todos

import "github.com/gin-gonic/gin"

func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("", h.Snapshot)
	r.POST("/import", h.Import)
	r.PUT("/priorities", h.SavePriorities)
	views := r.Group("/views")
	views.POST("", h.CreateView)
	views.PATCH("/:id", h.UpdateView)
	views.DELETE("/:id", h.DeleteView)
	lists := r.Group("/lists")
	lists.POST("", h.CreateList)
	lists.PATCH("/:id", h.UpdateList)
	lists.DELETE("/:id", h.DeleteList)
	tasks := r.Group("/tasks")
	tasks.POST("", h.CreateTask)
	tasks.PATCH("/:id", h.UpdateTask)
	tasks.DELETE("/:id", h.DeleteTask)
}
