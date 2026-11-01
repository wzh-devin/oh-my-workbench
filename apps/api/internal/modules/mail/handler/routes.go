package handler

import "github.com/gin-gonic/gin"

// 挂载邮箱模块路由，调用方统一安装登录校验。
// RegisterRoutes mounts the mailbox contract under the existing session middleware.
func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/accounts", h.Accounts)
	r.POST("/accounts", h.SaveAccount)
	r.PATCH("/accounts/:id", h.SaveAccount)
	r.POST("/accounts/:id/sync", h.Sync)
	r.GET("/sync-jobs/:id", h.Job)
	r.POST("/messages/query", h.Query)
	r.POST("/messages/bulk", h.BulkMessages)
	r.GET("/messages/:id", h.Message)
	r.PATCH("/messages/:id", h.ChangeMessage)
	r.GET("/attachments/:id/download", h.Download)
	r.GET("/overview", h.Overview)
	r.GET("/events", h.Events)
	r.GET("/push/config", h.PushConfig)
	r.POST("/push/subscriptions", h.Subscribe)
	r.DELETE("/push/subscriptions", h.Unsubscribe)
	r.GET("/notifications", h.Notifications)
	r.PATCH("/notifications/read", h.ReadNotifications)
	r.PUT("/preferences", h.Preferences)
}
