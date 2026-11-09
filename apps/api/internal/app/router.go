package app

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/repository"
	assetrouter "github.com/devin/oh-my-workbench/api/internal/router/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	mailrouter "github.com/devin/oh-my-workbench/api/internal/router/mail"
	noterouter "github.com/devin/oh-my-workbench/api/internal/router/notes"
	settingsrouter "github.com/devin/oh-my-workbench/api/internal/router/settings"
	todorouter "github.com/devin/oh-my-workbench/api/internal/router/todos"
	workbenchrouter "github.com/devin/oh-my-workbench/api/internal/router/workbench"
	assetservice "github.com/devin/oh-my-workbench/api/internal/service/assets"
	authservice "github.com/devin/oh-my-workbench/api/internal/service/auth"
	mailservice "github.com/devin/oh-my-workbench/api/internal/service/mail"
	noteservice "github.com/devin/oh-my-workbench/api/internal/service/notes"
	settingsservice "github.com/devin/oh-my-workbench/api/internal/service/settings"
	todoservice "github.com/devin/oh-my-workbench/api/internal/service/todos"
	workbenchservice "github.com/devin/oh-my-workbench/api/internal/service/workbench"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

func newRouter(repos *repository.Store, mailService *mailservice.Service, proxySettings *settingsservice.ProxyService, systemSettings *settingsservice.SystemService, signingKey string, assetServices ...*assetservice.Service) (*gin.Engine, error) {
	accountService := authservice.NewService(repos, signingKey)
	accountRouter := authrouter.NewRouter(accountService)
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
	accountRouter.RegisterRoutes(api.Group("/auth"))
	accountRouter.RegisterSecurityRoutes(api.Group("/account/security", accountRouter.RequireSession))
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	noteService, err := noteservice.NewService(ctx, repos, accountService)
	if err != nil {
		return nil, err
	}
	api.GET("/notes/health", func(c *gin.Context) {
		if !noteService.Ready() {
			c.Status(http.StatusServiceUnavailable)
			return
		}
		c.Status(http.StatusNoContent)
	})
	noterouter.NewRouter(noteService).RegisterRoutes(api.Group("/notes", accountRouter.RequireSession))
	todoRouter := todorouter.NewRouter(todoservice.NewService(repos))
	todoRouter.RegisterRoutes(api.Group("/todos", accountRouter.RequireSession))
	workbenchrouter.NewRouter(workbenchservice.NewService(repos)).RegisterRoutes(api.Group("/workbench", accountRouter.RequireSession))
	mailrouter.NewRouter(mailService).RegisterRoutes(api.Group("/mail", accountRouter.RequireSession))
	if proxySettings != nil {
		settingsrouter.NewProxyRouter(proxySettings).RegisterRoutes(api.Group("/settings/proxies", accountRouter.RequireSession))
	}
	if systemSettings != nil {
		settingsrouter.NewSystemRouter(systemSettings).RegisterRoutes(api.Group("/settings/system", accountRouter.RequireSession))
	}
	if len(assetServices) > 0 {
		assetrouter.NewRouter(assetServices[0]).RegisterRoutes(api.Group("/assets", accountRouter.RequireSession))
	}
	return r, nil
}
