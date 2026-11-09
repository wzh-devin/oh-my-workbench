package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/devin/oh-my-workbench/api/internal/config"
	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	authreq "github.com/devin/oh-my-workbench/api/internal/domain/req/auth"
	authresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/auth"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/password"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

// CurrentSessionKey 仅在 RequireSession 之后使用；业务租约不持久化原始凭证。
func CurrentSessionKey(c *gin.Context) string {
	digest := sha256.Sum256([]byte(requestToken(c)))
	return hex.EncodeToString(digest[:])
}

func readCredentials(c *gin.Context) (authreq.CredentialsRequest, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	var req authreq.CredentialsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, http.StatusBadRequest, "用户名或密码格式错误")
		return req, false
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		response.Fail(c, http.StatusBadRequest, "请输入用户名")
		return req, false
	}
	return req, true
}

func authError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, authdomain.ErrCredentials), errors.Is(err, authdomain.ErrUnauthorized):
		response.Fail(c, http.StatusUnauthorized, err.Error())
	case errors.Is(err, authdomain.ErrCurrentPassword), errors.Is(err, authdomain.ErrPasswordInput), errors.Is(err, authdomain.ErrPasswordUnchanged):
		response.Fail(c, http.StatusBadRequest, err.Error())
	case errors.Is(err, authdomain.ErrInitialized), errors.Is(err, authdomain.ErrUsername), errors.Is(err, authdomain.ErrPasswordConflict):
		response.Fail(c, http.StatusConflict, err.Error())
	case errors.Is(err, authdomain.ErrRateLimited):
		c.Header("Retry-After", "60")
		response.Fail(c, http.StatusTooManyRequests, err.Error())
	case errors.Is(err, password.ErrBusy):
		response.Fail(c, http.StatusServiceUnavailable, "请稍后重试")
	default:
		logging.Error(c.Request.Context(), "auth.failed", err)
		response.Fail(c, http.StatusServiceUnavailable, "认证服务暂不可用，请重试")
	}
}

func (h Router) setCookie(c *gin.Context, value string, maxAge int) {
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(cookieName, value, maxAge, "/api", "", config.Get().CookieSecure, true)
}

func (h Router) Login(c *gin.Context) {
	req, ok := readCredentials(c)
	if !ok {
		return
	}
	user, value, err := h.service.Login(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		authError(c, err)
		return
	}
	h.setCookie(c, value, int(authdomain.SessionDuration.Seconds()))
	response.Success(c, authresp.LoginResponse{Token: value, User: user})
}

func (h Router) InitSystemAdmin(c *gin.Context) {
	req, ok := readCredentials(c)
	if !ok {
		return
	}
	if err := h.service.InitSystemAdmin(c.Request.Context(), req.Username, req.Password); err != nil {
		authError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h Router) Status(c *gin.Context) {
	initialized, err := h.service.Initialized(c.Request.Context())
	if err != nil {
		authError(c, err)
		return
	}
	response.Success(c, authresp.InitializationStatusResponse{Initialized: initialized})
}

func requestToken(c *gin.Context) string {
	if value, err := c.Cookie(cookieName); err == nil && value != "" {
		return value
	}
	header := strings.Fields(c.GetHeader("Authorization"))
	if len(header) == 2 && strings.EqualFold(header[0], "Bearer") {
		return header[1]
	}
	return ""
}

// RequireSession 统一校验签名、Redis 会话和当前账户状态，供受保护路由复用。
func (h Router) RequireSession(c *gin.Context) {
	session, err := h.service.Authenticate(c.Request.Context(), requestToken(c))
	if err != nil {
		authError(c, err)
		return
	}
	c.Set("auth.session", session)
	c.Next()
}

func (h Router) Me(c *gin.Context) { response.Success(c, c.MustGet("auth.session")) }

func (h Router) Logout(c *gin.Context) {
	if err := h.service.Logout(c.Request.Context(), requestToken(c)); err != nil {
		authError(c, err)
		return
	}
	h.setCookie(c, "", -1)
	response.Success(c, nil)
}
