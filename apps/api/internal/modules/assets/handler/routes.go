package handler

import (
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/gin-gonic/gin"
)

func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/overview", h.overview)
	r.POST("/imports/metadata", h.importMetadata)
	r.GET("/connections", h.connections)
	r.POST("/connections", h.saveConnection)
	r.PATCH("/connections/:id", h.saveConnection)
	r.POST("/connections/:id/test", h.testConnection)
	r.POST("/entries/query", h.query)
	r.GET("/entries/:id", h.entry)
	r.POST("/folders", h.saveEntry)
	r.PATCH("/entries/:id", h.saveEntry)
	r.POST("/entries/batch", h.batch)
	r.GET("/entries/:id/content", h.content)
	r.HEAD("/entries/:id/content", h.content)
	r.POST("/entries/:id/preview", h.preview)
	r.GET("/entries/:id/preview", h.preview)
	r.GET("/entries/:id/thumbnail", h.thumbnail)
	r.HEAD("/entries/:id/thumbnail", h.thumbnail)
	r.POST("/entries/:id/thumbnail", h.retryThumbnail)
	r.GET("/views", h.views)
	r.POST("/views", h.saveView)
	r.PATCH("/views/:id", h.saveView)
	r.DELETE("/views/:id", h.deleteView)
	r.POST("/uploads/init", h.initUpload)
	r.GET("/uploads", h.uploads)
	r.GET("/uploads/:id", h.upload)
	r.PUT("/uploads/:id/parts/:number", logging.MetadataOnly, h.putPart)
	r.PATCH("/uploads/:id", h.controlUpload)
	r.DELETE("/uploads/:id", h.controlUpload)
	r.POST("/uploads/:id/complete", h.completeUpload)
	r.GET("/operations/:id", h.operation)
}
