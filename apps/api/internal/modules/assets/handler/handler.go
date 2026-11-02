package handler

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/modules/assets/domain"
	assetservice "github.com/devin/oh-my-workbench/api/internal/modules/assets/service"
	authhandler "github.com/devin/oh-my-workbench/api/internal/modules/auth/handler"
	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
	"github.com/devin/oh-my-workbench/api/internal/shared/response"
)

// 资产 HTTP 入口，负责严格解码、统一错误与二进制内容响应。
type Handler struct{ service *assetservice.Service }

func NewHandler(service *assetservice.Service) *Handler { return &Handler{service} }

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

func (h *Handler) connections(c *gin.Context) {
	value, err := h.service.Connections(c.Request.Context(), authhandler.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Handler) saveConnection(c *gin.Context) {
	var input assetdomain.ConnectionInput
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveConnection(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, value, err)
}

func (h *Handler) testConnection(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.TestConnection(c.Request.Context(), authhandler.CurrentUserID(c), id)
	finish(c, value, err)
}

// page keeps directory, view and nested filters in one bounded JSON request.
func (h *Handler) page(c *gin.Context) {
	input := assetdomain.QueryInput{Page: 1, PageSize: 50}
	if !read(c, &input) {
		return
	}
	if input.Page < 1 || input.Page > 1000000 {
		fail(c, assetdomain.ErrInvalid)
		return
	}
	input.Page--
	value, err := h.service.Query(c.Request.Context(), authhandler.CurrentUserID(c), input)
	finish(c, value, err)
}

func (h *Handler) saveEntry(c *gin.Context) {
	var input assetdomain.EntryInput
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveEntry(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, value, err)
}

func (h *Handler) entry(c *gin.Context) {
	value, err := h.service.Entry(c.Request.Context(), authhandler.CurrentUserID(c), c.Param("id"))
	finish(c, value, err)
}

func (h *Handler) importMetadata(c *gin.Context) {
	var input struct {
		Entries []assetdomain.ImportEntry `json:"entries"`
	}
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.ImportMetadata(c.Request.Context(), authhandler.CurrentUserID(c), input.Entries))
}

func (h *Handler) batch(c *gin.Context) {
	var input assetdomain.BatchInput
	if !read(c, &input) {
		return
	}
	action := strings.TrimSuffix(c.FullPath()[strings.LastIndex(c.FullPath(), "/")+1:], "Batch")
	if input.Action != "" && input.Action != action {
		fail(c, assetdomain.ErrInvalid)
		return
	}
	input.Action = action
	value, err := h.service.Batch(c.Request.Context(), authhandler.CurrentUserID(c), input)
	finish(c, value, err)
}

func (h *Handler) views(c *gin.Context) {
	value, err := h.service.Views(c.Request.Context(), authhandler.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Handler) saveView(c *gin.Context) {
	var input assetdomain.ViewInput
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveView(c.Request.Context(), authhandler.CurrentUserID(c), id, input)
	finish(c, value, err)
}

func (h *Handler) deleteViews(c *gin.Context) {
	var input struct {
		Items []assetdomain.BatchItem `json:"items"`
	}
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.DeleteViews(c.Request.Context(), authhandler.CurrentUserID(c), input.Items))
}

func (h *Handler) initUpload(c *gin.Context) {
	var input assetdomain.UploadInput
	if !read(c, &input) {
		return
	}
	value, err := h.service.InitUpload(c.Request.Context(), authhandler.CurrentUserID(c), input)
	finish(c, value, err)
}

func (h *Handler) uploads(c *gin.Context) {
	if key := c.Query("requestKey"); key != "" {
		value, err := h.service.LookupUpload(c.Request.Context(), authhandler.CurrentUserID(c), key)
		finish(c, value, err)
		return
	}
	value, err := h.service.Uploads(c.Request.Context(), authhandler.CurrentUserID(c))
	finish(c, value, err)
}

func (h *Handler) upload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Upload(c.Request.Context(), authhandler.CurrentUserID(c), id)
	finish(c, value, err)
}

func (h *Handler) putPart(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	number, err := strconv.Atoi(c.Param("number"))
	if err != nil {
		fail(c, assetdomain.ErrInvalid)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, assetdomain.MultipartThreshold)
	finish(c, nil, h.service.PutPart(c.Request.Context(), authhandler.CurrentUserID(c), id, number, c.GetHeader("X-Part-SHA256"), c.Request.ContentLength, c.Request.Body))
}

func (h *Handler) controlUpload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	input := struct {
		Status  string `json:"status"`
		Version int    `json:"version"`
	}{Status: "cleaning"}
	if c.Request.Method == http.MethodPatch {
		if !read(c, &input) {
			return
		}
		if input.Status != "paused" && input.Status != "uploading" {
			fail(c, assetdomain.ErrInvalid)
			return
		}
	}
	value, err := h.service.ControlUpload(c.Request.Context(), authhandler.CurrentUserID(c), id, input.Status, input.Version)
	finish(c, value, err)
}

func (h *Handler) completeUpload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.CompleteUpload(c.Request.Context(), authhandler.CurrentUserID(c), id)
	finish(c, value, err)
}

func (h *Handler) operation(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Operation(c.Request.Context(), authhandler.CurrentUserID(c), id)
	finish(c, value, err)
}

func (h *Handler) preview(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Preview(c.Request.Context(), authhandler.CurrentUserID(c), id, c.Request.Method == http.MethodPost)
	finish(c, value, err)
}

// content 只处理 HTTP Range 和响应头，权限与格式边界由 Service 统一检查。
func (h *Handler) access(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.AccessContent(c.Request.Context(), authhandler.CurrentUserID(c), id, c.Query("preview") == "1", c.Query("download") == "1")
	finish(c, value, err)
}

func (h *Handler) content(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	download := c.Query("download") == "1"
	content, err := h.service.OpenContent(c.Request.Context(), authhandler.CurrentUserID(c), id, c.Query("preview") == "1", download)
	h.serveContent(c, content, download, err)
}

func (h *Handler) retryThumbnail(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Thumbnail(c.Request.Context(), authhandler.CurrentUserID(c), id)
	finish(c, value, err)
}

func (h *Handler) thumbnail(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	content, err := h.service.OpenRendition(c.Request.Context(), authhandler.CurrentUserID(c), id, assetdomain.ThumbnailVersion, false)
	h.serveContent(c, content, false, err)
}

// 缓存协商发生在Service完成权限检查后，撤销访问后不能靠304继续读取。
func (h *Handler) serveContent(c *gin.Context, content assetservice.Content, download bool, err error) {
	if err != nil {
		c.Header("Cache-Control", "no-store")
		fail(c, err)
		return
	}
	defer content.Reader.Close()
	if strings.Contains(c.GetHeader("Range"), ",") {
		c.Header("Content-Range", fmtRange(content.Size))
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}
	disposition := "inline"
	if download {
		disposition = "attachment"
	}
	c.Header("Content-Type", content.Type)
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": content.Name}))
	c.Header("Accept-Ranges", "bytes")
	c.Header("ETag", `"`+content.ETag+`"`)
	if download {
		c.Header("Cache-Control", "no-store")
	} else {
		c.Header("Cache-Control", "private, no-cache")
	}
	http.ServeContent(c.Writer, c.Request, content.Name, content.ModifiedAt, content.Reader)
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
