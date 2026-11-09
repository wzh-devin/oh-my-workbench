package assets

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	assetservice "github.com/devin/oh-my-workbench/api/internal/service/assets"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

type Router struct{ service *assetservice.Service }

func NewRouter(service *assetservice.Service) *Router { return &Router{service} }

func fail(c *gin.Context, err error) {
	var conflict *assetdomain.UploadNameConflict
	if errors.As(err, &conflict) {
		c.AbortWithStatusJSON(http.StatusConflict, response.ApiResult{
			Code: http.StatusConflict, Message: conflict.Error(),
			Data: struct {
				Kind string `json:"kind"`
				*assetdomain.UploadNameConflict
			}{"upload_name_conflict", conflict},
		})
		return
	}
	switch {
	case errors.Is(err, assetdomain.ErrExtension), errors.Is(err, assetdomain.ErrInvalid), errors.Is(err, assetdomain.ErrRule), errors.Is(err, assetdomain.ErrEndpoint):
		response.Fail(c, 400, err.Error())
	case errors.Is(err, assetdomain.ErrNotFound):
		response.Fail(c, 404, err.Error())
	case errors.Is(err, assetdomain.ErrConflict), errors.Is(err, assetdomain.ErrName), errors.Is(err, assetdomain.ErrLastView):
		response.Fail(c, 409, err.Error())
	case errors.Is(err, assetdomain.ErrDisabled), errors.Is(err, assetdomain.ErrPreviewUnavailable), errors.Is(err, assetdomain.ErrConnectionCheck):
		logging.Error(c.Request.Context(), "assets.unavailable", err)
		response.Fail(c, 503, err.Error())
	default:
		logging.Error(c.Request.Context(), "assets.failed", err)
		response.Fail(c, 503, "资产服务暂不可用，请重试")
	}
}

func read(c *gin.Context, input any) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 64<<10)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(new(any)) != io.EOF {
		fail(c, assetdomain.ErrInvalid)
		return false
	}
	return true
}

func finish(c *gin.Context, value any, err error) {
	if err != nil {
		fail(c, err)
	} else {
		response.Success(c, value)
	}
}

func routeID(c *gin.Context) (int64, bool) {
	id, err := assetdomain.ParseID(c.Param("id"))
	if err != nil {
		fail(c, err)
		return 0, false
	}
	return id, true
}

func fmtRange(size int64) string { return "bytes */" + strconv.FormatInt(size, 10) }

func mutationID(c *gin.Context, value string) (int64, bool) {
	if strings.HasSuffix(c.FullPath(), "/save") {
		if value != "" {
			fail(c, assetdomain.ErrInvalid)
			return 0, false
		}
		return 0, true
	}
	id, e := assetdomain.ParseID(value)
	if e != nil {
		fail(c, e)
		return 0, false
	}
	return id, true
}

func (h *Router) RegisterRoutes(r *gin.RouterGroup) {
	r.GET("/directories", h.directories)
	r.GET("/statistics", h.statistics)
	r.POST("/imports/metadata", h.importMetadata)
	r.GET("/connections", h.connections)
	r.POST("/connections/save", h.saveConnection)
	r.POST("/connections/update", h.saveConnection)
	r.POST("/connections/:id/test", h.testConnection)
	r.POST("/entries/page", h.page)
	r.GET("/entries/:id", h.entry)
	r.POST("/entries/save", h.saveEntry)
	r.POST("/entries/update", h.saveEntry)
	r.POST("/entries/moveBatch", h.batch)
	r.POST("/entries/copyBatch", h.batch)
	r.POST("/entries/trashBatch", h.batch)
	r.POST("/entries/restoreBatch", h.batch)
	r.POST("/entries/deleteBatch", h.batch)
	r.POST("/entries/starBatch", h.batch)
	r.GET("/entries/:id/access", h.access)
	r.GET("/entries/:id/content", h.content)
	r.HEAD("/entries/:id/content", h.content)
	r.POST("/entries/:id/preview", h.preview)
	r.GET("/entries/:id/preview", h.preview)
	r.GET("/entries/:id/thumbnail", h.thumbnail)
	r.HEAD("/entries/:id/thumbnail", h.thumbnail)
	r.POST("/entries/:id/thumbnail", h.retryThumbnail)
	r.GET("/views", h.views)
	r.POST("/views/save", h.saveView)
	r.POST("/views/update", h.saveView)
	r.POST("/views/deleteBatch", h.deleteViews)
	r.POST("/uploads/init", h.initUpload)
	r.GET("/uploads", h.uploads)
	r.GET("/uploads/:id", h.upload)
	r.PUT("/uploads/:id/parts/:number", logging.MetadataOnly, h.putPart)
	r.PATCH("/uploads/:id", h.controlUpload)
	r.DELETE("/uploads/:id", h.controlUpload)
	r.POST("/uploads/:id/complete", h.completeUpload)
	r.GET("/operations/:id", h.operation)
}
