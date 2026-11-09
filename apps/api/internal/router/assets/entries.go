package assets

import (
	"strings"

	"github.com/gin-gonic/gin"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetreq "github.com/devin/oh-my-workbench/api/internal/domain/req/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

// page keeps directory, view and nested filters in one bounded JSON request.
func (h *Router) page(c *gin.Context) {
	input := assetreq.EntryPageRequest{Page: 1, PageSize: 50}
	if !read(c, &input) {
		return
	}
	if input.Page < 1 || input.Page > 1000000 {
		fail(c, assetdomain.ErrInvalid)
		return
	}
	input.Page--
	value, err := h.service.Query(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, fromQueryResult(value), err)
}

func (h *Router) saveEntry(c *gin.Context) {
	var input assetreq.SaveEntryRequest
	if !read(c, &input) {
		return
	}
	id, ok := mutationID(c, input.ID)
	if !ok {
		return
	}
	value, err := h.service.SaveEntry(c.Request.Context(), authrouter.CurrentUserID(c), id, input)
	finish(c, fromEntry(value), err)
}

func (h *Router) entry(c *gin.Context) {
	value, err := h.service.Entry(c.Request.Context(), authrouter.CurrentUserID(c), c.Param("id"))
	finish(c, fromEntry(value), err)
}

func (h *Router) importMetadata(c *gin.Context) {
	var input assetreq.ImportMetadataRequest
	if !read(c, &input) {
		return
	}
	finish(c, nil, h.service.ImportMetadata(c.Request.Context(), authrouter.CurrentUserID(c), input.Entries))
}

func (h *Router) batch(c *gin.Context) {
	var input assetreq.BatchRequest
	if !read(c, &input) {
		return
	}
	action := strings.TrimSuffix(c.FullPath()[strings.LastIndex(c.FullPath(), "/")+1:], "Batch")
	if input.Action != "" && input.Action != action {
		fail(c, assetdomain.ErrInvalid)
		return
	}
	input.Action = action
	value, err := h.service.Batch(c.Request.Context(), authrouter.CurrentUserID(c), input)
	finish(c, fromOperation(value), err)
}
