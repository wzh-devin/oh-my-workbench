package assets

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) initUpload(c *gin.Context) {
	var input assetreq.InitUploadRequest
	if !read(c, &input) {
		return
	}
	value, err := h.service.InitUpload(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, fromUpload(value), err)
}

func (h *Router) uploads(c *gin.Context) {
	if key := c.Query("requestKey"); key != "" {
		value, err := h.service.LookupUpload(c.Request.Context(), authrouter.CurrentUserID(c), key)
		finish(c, mapSlice(value, fromUpload), err)
		return
	}
	value, err := h.service.Uploads(c.Request.Context(), authrouter.CurrentUserID(c))
	finish(c, mapSlice(value, fromUpload), err)
}

func (h *Router) upload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Upload(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, fromUpload(value), err)
}

func (h *Router) putPart(c *gin.Context) {
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
	finish(c, nil, h.service.PutPart(c.Request.Context(), authrouter.CurrentUserID(c), id, number, c.GetHeader("X-Part-SHA256"), c.Request.ContentLength, c.Request.Body))
}

func (h *Router) controlUpload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	input := assetreq.ControlUploadRequest{Status: "cleaning"}
	if c.Request.Method == http.MethodPatch {
		if !read(c, &input) {
			return
		}
		if input.Status != "paused" && input.Status != "uploading" {
			fail(c, assetdomain.ErrInvalid)
			return
		}
	}
	value, err := h.service.ControlUpload(c.Request.Context(), authrouter.CurrentUserID(c), id, input.Status, input.Version)
	finish(c, fromUpload(value), err)
}

func (h *Router) completeUpload(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.CompleteUpload(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, fromUpload(value), err)
}

func (h *Router) operation(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Operation(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, fromOperation(value), err)
}
