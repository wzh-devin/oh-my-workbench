package app

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/devin/oh-my-workbench/api/internal/modules/assets"
	"github.com/devin/oh-my-workbench/api/internal/modules/auth"
	"github.com/devin/oh-my-workbench/api/internal/modules/mail"
	"github.com/devin/oh-my-workbench/api/internal/modules/todos"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

func newRouter(db *gorm.DB, rdb *redis.Client, mailService *mail.Service, assetServices ...*assets.Service) *gin.Engine {
	handler := auth.NewHandler(auth.NewService(auth.NewRepository(db, rdb)))
	r := gin.New()
	r.Use(gin.Recovery())
	_ = r.SetTrustedProxies(nil)
	api := r.Group("/api", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			origin := c.GetHeader("Origin")
			if origin != "" {
				parsed, err := url.Parse(origin)
				if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || !strings.EqualFold(parsed.Host, c.Request.Host) || parsed.User != nil {
					response.Fail(c, http.StatusForbidden, "请求来源无效")
					return
				}
			}
			if c.GetHeader("Sec-Fetch-Site") == "cross-site" {
				response.Fail(c, http.StatusForbidden, "请求来源无效")
				return
			}
		}
		c.Next()
	})
	handler.RegisterRoutes(api.Group("/auth"))
	todoHandler := todos.NewHandler(todos.NewService(todos.NewRepository(db)))
	todoHandler.RegisterRoutes(api.Group("/todos", handler.RequireSession))
	mail.NewHandler(mailService).RegisterRoutes(api.Group("/mail", handler.RequireSession))
	if len(assetServices) > 0 {
		assets.NewHandler(assetServices[0]).RegisterRoutes(api.Group("/assets", handler.RequireSession))
	}
	return r
}
