package handler

import "github.com/gin-gonic/gin"

// 挂载邮箱模块路由，调用方统一安装登录校验。
// RegisterRoutes mounts the mailbox contract under the existing session middleware.
func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/accounts", h.Accounts)
	r.POST("/accounts/save", h.SaveAccount)
	r.POST("/accounts/update", h.SaveAccount)
	r.POST("/accounts/:id/sync", h.Sync)
	r.GET("/sync-jobs/:id", h.Job)
	r.POST("/messages/page", h.Page)
	r.POST("/messages/bulk", h.BulkMessages)
	r.GET("/messages/:id", h.Message)
	r.POST("/messages/update", h.ChangeMessage)
	r.GET("/attachments/:id/download", h.Download)
	r.GET("/events", h.Events)
	r.GET("/push/config", h.PushConfig)
	r.POST("/push/subscriptions", h.Subscribe)
	r.DELETE("/push/subscriptions", h.Unsubscribe)
	r.GET("/notifications", h.Notifications)
	r.PATCH("/notifications/read", h.ReadNotifications)
	r.GET("/preferences", h.GetPreferences)
	r.PUT("/preferences", h.Preferences)
}
