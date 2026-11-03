package app

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	redis "github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	assethandler "github.com/devin/oh-my-workbench/api/internal/modules/assets/handler"
	assetservice "github.com/devin/oh-my-workbench/api/internal/modules/assets/service"
	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	authrepo "github.com/devin/oh-my-workbench/api/internal/modules/auth/repository"
	authservice "github.com/devin/oh-my-workbench/api/internal/modules/auth/service"
	mailhandler "github.com/devin/oh-my-workbench/api/internal/modules/mail/handler"
	mailservice "github.com/devin/oh-my-workbench/api/internal/modules/mail/service"
	notehandler "github.com/devin/oh-my-workbench/api/internal/modules/notes/handler"
	noterepo "github.com/devin/oh-my-workbench/api/internal/modules/notes/repository"
	noteservice "github.com/devin/oh-my-workbench/api/internal/modules/notes/service"
	settingshandler "github.com/devin/oh-my-workbench/api/internal/modules/settings/handler"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/modules/settings/service"
	todohandler "github.com/devin/oh-my-workbench/api/internal/modules/todos/handler"
	todorepo "github.com/devin/oh-my-workbench/api/internal/modules/todos/repository"
	todoservice "github.com/devin/oh-my-workbench/api/internal/modules/todos/service"
	workbenchhandler "github.com/devin/oh-my-workbench/api/internal/modules/workbench/handler"
	workbenchrepo "github.com/devin/oh-my-workbench/api/internal/modules/workbench/repository"
	workbenchservice "github.com/devin/oh-my-workbench/api/internal/modules/workbench/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func newRouter(db *gorm.DB, rdb *redis.Client, mailService *mailservice.Service, proxySettings *settingsservice.ProxyService, systemSettings *settingsservice.SystemService, signingKey string, assetServices ...*assetservice.Service) *gin.Engine {
	accountService := authservice.NewService(authrepo.NewRepository(db, rdb), signingKey)
	handler := authhandler.NewHandler(accountService)
	r := gin.New()
	r.Use(logging.HTTP())
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})
	r.RemoteIPHeaders = []string{"X-Real-IP"}
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
	handler.RegisterSecurityRoutes(api.Group("/account/security", handler.RequireSession))
	notehandler.NewHandler(noteservice.NewService(noterepo.NewRepository(db, rdb), accountService, noteservice.KeyFile)).RegisterRoutes(api.Group("/notes", handler.RequireSession))
	todoHandler := todohandler.NewHandler(todoservice.NewService(todorepo.NewRepository(db)))
	todoHandler.RegisterRoutes(api.Group("/todos", handler.RequireSession))
	workbenchhandler.NewHandler(workbenchservice.NewService(workbenchrepo.NewRepository(db))).RegisterRoutes(api.Group("/workbench", handler.RequireSession))
	mailhandler.NewHandler(mailService).RegisterRoutes(api.Group("/mail", handler.RequireSession))
	if proxySettings != nil {
		settingshandler.NewProxyHandler(proxySettings).RegisterRoutes(api.Group("/settings/proxies", handler.RequireSession))
	}
	if systemSettings != nil {
		settingshandler.NewSystemHandler(systemSettings).RegisterRoutes(api.Group("/settings/system", handler.RequireSession))
	}
	if len(assetServices) > 0 {
		assethandler.NewHandler(assetServices[0]).RegisterRoutes(api.Group("/assets", handler.RequireSession))
	}
	return r
}
