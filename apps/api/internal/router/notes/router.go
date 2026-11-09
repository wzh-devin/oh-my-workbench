package notes

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	authdomain "github.com/devin/oh-my-workbench/api/internal/domain/auth"
	notedomain "github.com/devin/oh-my-workbench/api/internal/domain/notes"
	notereq "github.com/devin/oh-my-workbench/api/internal/domain/req/notes"
	noteresp "github.com/devin/oh-my-workbench/api/internal/domain/resp/notes"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
	noteservice "github.com/devin/oh-my-workbench/api/internal/service/notes"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Router struct{ service *noteservice.Service }

func NewRouter(s *noteservice.Service) *Router { return &Router{service: s} }

func fail(c *gin.Context, err error) {
	status := http.StatusServiceUnavailable
	message := "记事本暂不可用，请重试"
	switch {
	case errors.Is(err, notedomain.ErrVerification), errors.Is(err, notedomain.ErrInvalid), errors.Is(err, notedomain.ErrLastView), errors.Is(err, notedomain.ErrViewName):
		status = 400
		message = err.Error()
	case errors.Is(err, notedomain.ErrNotFound):
		status = 404
		message = err.Error()
	case errors.Is(err, notedomain.ErrConflict), errors.Is(err, notedomain.ErrViewConflict), errors.Is(err, notedomain.ErrPasskeyChanged):
		status = 409
		message = err.Error()
	case errors.Is(err, notedomain.ErrLocked):
		status = 423
		message = err.Error()
	case errors.Is(err, notedomain.ErrUnavailable):
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
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (notedomain.MaxBody*6)+(64<<10))
	if err := c.ShouldBindJSON(value); err != nil {
		fail(c, notedomain.ErrInvalid)
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
	sum := sha256.Sum256([]byte(authrouter.CurrentSessionKey(c) + ":" + context))
	return hex.EncodeToString(sum[:])
}

func ids(c *gin.Context) (int64, int64, string, bool) {
	user := authrouter.CurrentUserID(c)
	session := accessSession(c)
	var id int64
	if text := c.Param("id"); text != "" {
		var err error
		id, err = notedomain.ParseID(text)
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

func (h *Router) RegisterRoutes(r *gin.RouterGroup) {
	r.Use(logging.SensitiveBody)
	h.passkeys(r)
	r.GET("/views", func(c *gin.Context) {
		out, err := h.service.Views(c.Request.Context(), authrouter.CurrentUserID(c))
		result(c, out, err)
	})
	for _, path := range []string{"/views/save", "/views/update"} {
		r.POST(path, func(c *gin.Context) {
			var input notereq.SaveViewRequest
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, notedomain.ErrInvalid)
				return
			}
			out, err := h.service.SaveView(c.Request.Context(), authrouter.CurrentUserID(c), input)
			result(c, out, err)
		})
	}
	r.POST("/views/delete", func(c *gin.Context) {
		var target notereq.TargetRequest
		if !bind(c, &target) {
			return
		}
		result(c, nil, h.service.DeleteView(c.Request.Context(), authrouter.CurrentUserID(c), target))
	})
	r.GET("/notebooks", func(c *gin.Context) {
		out, err := h.service.Notebooks(c.Request.Context(), authrouter.CurrentUserID(c))
		result(c, out, err)
	})
	for _, path := range []string{"/notebooks/save", "/notebooks/update"} {
		r.POST(path, func(c *gin.Context) {
			var input notereq.SaveNotebookRequest
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, notedomain.ErrInvalid)
				return
			}
			out, err := h.service.SaveNotebook(c.Request.Context(), authrouter.CurrentUserID(c), input.TargetRequest, input.Name)
			result(c, out, err)
		})
	}
	r.POST("/notebooks/deleteBatch", func(c *gin.Context) {
		var input notereq.BatchRequest
		if !bind(c, &input) {
			return
		}
		result(c, nil, h.service.DeleteNotebooks(c.Request.Context(), authrouter.CurrentUserID(c), input.Targets))
	})
	r.POST("/page", func(c *gin.Context) {
		var input notereq.NotePageRequest
		if !bind(c, &input) {
			return
		}
		out, err := h.service.Page(c.Request.Context(), authrouter.CurrentUserID(c), input)
		result(c, out, err)
	})
	for _, path := range []string{"/save", "/update"} {
		r.POST(path, func(c *gin.Context) {
			var input notereq.SaveNoteRequest
			if !bind(c, &input) {
				return
			}
			if strings.HasSuffix(c.FullPath(), "/update") != (input.ID != "") {
				fail(c, notedomain.ErrInvalid)
				return
			}
			out, err := h.service.Save(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c), input, false)
			result(c, out, err)
		})
	}
	for path, action := range map[string]string{"/deleteBatch": "delete", "/restoreBatch": "restore", "/purgeBatch": "purge"} {
		r.POST(path, func(c *gin.Context) {
			var input notereq.BatchRequest
			if !bind(c, &input) {
				return
			}
			result(c, nil, h.service.Batch(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c), input.Targets, action))
		})
	}
	r.POST("/unlock", func(c *gin.Context) {
		var input notereq.PasswordRequest
		if !bind(c, &input) {
			return
		}
		until, err := h.service.Unlock(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c), input.Password)
		result(c, noteresp.UnlockResponse{ExpiresAt: until}, err)
	})
	r.POST("/lock", func(c *gin.Context) {
		result(c, nil, h.service.Lock(c.Request.Context(), authrouter.CurrentUserID(c), accessSession(c)))
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
		revision, err := notedomain.ParseID(c.Param("revision"))
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
		revision, err := notedomain.ParseID(c.Param("revision"))
		if err != nil {
			fail(c, err)
			return
		}
		var input notereq.RestoreRevisionRequest
		if !bind(c, &input) {
			return
		}
		out, err := h.service.RestoreRevision(c.Request.Context(), user, id, revision, session, input.Version)
		result(c, out, err)
	})
}
