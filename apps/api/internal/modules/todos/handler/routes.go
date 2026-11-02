package handler

import "github.com/gin-gonic/gin"

func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
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
