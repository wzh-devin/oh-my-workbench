// Package handler exposes only the current user's note contracts.
package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	authdomain "github.com/devin/oh-my-workbench/api/internal/modules/auth/domain"
	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	d "github.com/devin/oh-my-workbench/api/internal/modules/notes/domain"
	service "github.com/devin/oh-my-workbench/api/internal/modules/notes/service"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
	"github.com/gin-gonic/gin"
)

type Handler struct{ service *service.Service }

func NewHandler(s *service.Service) *Handler { return &Handler{service: s} }
func fail(c *gin.Context, err error) {
	status := http.StatusServiceUnavailable
	message := "记事本暂不可用，请重试"
	switch {
	case errors.Is(err, d.ErrVerification), errors.Is(err, d.ErrInvalid), errors.Is(err, d.ErrLastView), errors.Is(err, d.ErrViewName):
		status = 400
		message = err.Error()
	case errors.Is(err, d.ErrNotFound):
		status = 404
		message = err.Error()
	case errors.Is(err, d.ErrConflict), errors.Is(err, d.ErrViewConflict), errors.Is(err, d.ErrPasskeyChanged):
		status = 409
		message = err.Error()
	case errors.Is(err, d.ErrLocked):
		status = 423
		message = err.Error()
	case errors.Is(err, d.ErrUnavailable):
		message = err.Error()
	case errors.Is(err, authdomain.ErrCurrentPassword), errors.Is(err, authdomain.ErrPasswordInput):
		status = 400
		message = err.Error()
	case errors.Is(err, authdomain.ErrUnauthorized):
		status = 401
		message = err.Error()
	case errors.Is(err, authdomain.ErrRateLimited):
		status = 429
		message = err.Error()
		c.Header("Retry-After", "60")
	default:
		logging.Error(c.Request.Context(), "notes.failed", err)
	}
	response.Fail(c, status, message)
}
func bind(c *gin.Context, value any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (d.MaxBody*6)+(64<<10))
	if err := c.ShouldBindJSON(value); err != nil {
		fail(c, d.ErrInvalid)
		return false
	}
	return true
}

// Each editor opening has an independent in-memory context; legacy session leases are not reused.
func accessSession(c *gin.Context) string {
	context := c.GetHeader("X-Notes-Context")
	if len(context) != 36 || strings.ContainsAny(context, " \r\n\t") {
		return ""
	}
	sum := sha256.Sum256([]byte(authhandler.CurrentSessionKey(c) + ":" + context))
	return hex.EncodeToString(sum[:])
}
func ids(c *gin.Context) (int64, int64, string, bool) {
	user := authhandler.CurrentUserID(c)
	session := accessSession(c)
	var id int64
	if text := c.Param("id"); text != "" {
		var err error
		id, err = d.ParseID(text)
		if err != nil {
			fail(c, err)
			return 0, 0, "", false
		}
	}
	return user, id, session, true
}
func result(c *gin.Context, value any, err error) {
	if err != nil {
		fail(c, err)
		return
	}
	response.Success(c, value)
}
func (h *Handler) RegisterRoutes(r *gin.RouterGroup) {
	r.Use(logging.SensitiveBody)
	h.passkeys(r)
	r.GET("/views", func(c *gin.Context) {
		out, err := h.service.Views(c.Request.Context(), authhandler.CurrentUserID(c))
		result(c, out, err)
	})
	for _, path := range []string{"/views/save", "/views/update"} {
		r.POST(path, func(c *gin.Context) {
			var input d.ViewInput
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, d.ErrInvalid)
				return
			}
			out, err := h.service.SaveView(c.Request.Context(), authhandler.CurrentUserID(c), input)
			result(c, out, err)
		})
	}
	r.POST("/views/delete", func(c *gin.Context) {
		var target d.Target
		if !bind(c, &target) {
			return
		}
		result(c, nil, h.service.DeleteView(c.Request.Context(), authhandler.CurrentUserID(c), target))
	})
	r.GET("/notebooks", func(c *gin.Context) {
		out, err := h.service.Notebooks(c.Request.Context(), authhandler.CurrentUserID(c))
		result(c, out, err)
	})
	for _, path := range []string{"/notebooks/save", "/notebooks/update"} {
		r.POST(path, func(c *gin.Context) {
			var input struct {
				d.Target
				Name string `json:"name"`
			}
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, d.ErrInvalid)
				return
			}
			out, err := h.service.SaveNotebook(c.Request.Context(), authhandler.CurrentUserID(c), input.Target, input.Name)
			result(c, out, err)
		})
	}
	r.POST("/notebooks/deleteBatch", func(c *gin.Context) {
		var input struct {
			Targets []d.Target `json:"targets"`
		}
		if !bind(c, &input) {
			return
		}
		result(c, nil, h.service.DeleteNotebooks(c.Request.Context(), authhandler.CurrentUserID(c), input.Targets))
	})
	r.POST("/page", func(c *gin.Context) {
		var input d.Query
		if !bind(c, &input) {
			return
		}
		out, err := h.service.Page(c.Request.Context(), authhandler.CurrentUserID(c), input)
		result(c, out, err)
	})
	for _, path := range []string{"/save", "/update"} {
		r.POST(path, func(c *gin.Context) {
			var input d.SaveInput
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, d.ErrInvalid)
				return
			}
			out, err := h.service.Save(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c), input, false)
			result(c, out, err)
		})
	}
	for path, action := range map[string]string{"/deleteBatch": "delete", "/restoreBatch": "restore", "/purgeBatch": "purge"} {
		r.POST(path, func(c *gin.Context) {
			var input struct {
				Targets []d.Target `json:"targets"`
			}
			if !bind(c, &input) {
				return
			}
			result(c, nil, h.service.Batch(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c), input.Targets, action))
		})
	}
	r.POST("/unlock", func(c *gin.Context) {
		var input struct {
			Password string `json:"password"`
		}
		if !bind(c, &input) {
			return
		}
		until, err := h.service.Unlock(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c), input.Password)
		result(c, gin.H{"expiresAt": until}, err)
	})
	r.POST("/lock", func(c *gin.Context) {
		result(c, nil, h.service.Lock(c.Request.Context(), authhandler.CurrentUserID(c), accessSession(c)))
	})
	r.GET("/:id/metadata", func(c *gin.Context) {
		user, id, _, ok := ids(c)
		if !ok {
			return
		}
		out, err := h.service.Metadata(c.Request.Context(), user, id)
		result(c, out, err)
	})
	r.GET("/:id", func(c *gin.Context) {
		user, id, session, ok := ids(c)
		if !ok {
			return
		}
		out, err := h.service.Detail(c.Request.Context(), user, id, session)
		result(c, out, err)
	})
	r.GET("/:id/revisions", func(c *gin.Context) {
		user, id, session, ok := ids(c)
		if !ok {
			return
		}
		out, err := h.service.Revisions(c.Request.Context(), user, id, session)
		result(c, out, err)
	})
	r.GET("/:id/revisions/:revision", func(c *gin.Context) {
		user, id, session, ok := ids(c)
		if !ok {
			return
		}
		revision, err := d.ParseID(c.Param("revision"))
		if err != nil {
			fail(c, err)
			return
		}
		out, err := h.service.Revision(c.Request.Context(), user, id, revision, session)
		result(c, out, err)
	})
	r.POST("/:id/revisions/:revision/restore", func(c *gin.Context) {
		user, id, session, ok := ids(c)
		if !ok {
			return
		}
		revision, err := d.ParseID(c.Param("revision"))
		if err != nil {
			fail(c, err)
			return
		}
		var input struct {
			Version int `json:"version"`
		}
		if !bind(c, &input) {
			return
		}
		out, err := h.service.RestoreRevision(c.Request.Context(), user, id, revision, session, input.Version)
		result(c, out, err)
	})
}
