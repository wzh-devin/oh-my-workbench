package assets

import (
	"mime"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	assetdomain "github.com/devin/oh-my-workbench/api/internal/domain/assets"
	assetdto "github.com/devin/oh-my-workbench/api/internal/domain/dto/assets"
	authrouter "github.com/devin/oh-my-workbench/api/internal/router/auth"
)

func (h *Router) preview(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Preview(c.Request.Context(), authrouter.CurrentUserID(c), id, c.Request.Method == http.MethodPost)
	finish(c, fromPreview(value), err)
}

// content 只处理 HTTP Range 和响应头，权限与格式边界由 Service 统一检查。
func (h *Router) access(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.AccessContent(c.Request.Context(), authrouter.CurrentUserID(c), id, c.Query("preview") == "1", c.Query("download") == "1")
	finish(c, fromContentAccess(value), err)
}

func (h *Router) content(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	download := c.Query("download") == "1"
	content, err := h.service.OpenContent(c.Request.Context(), authrouter.CurrentUserID(c), id, c.Query("preview") == "1", download)
	h.serveContent(c, content, download, err)
}

func (h *Router) retryThumbnail(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	value, err := h.service.Thumbnail(c.Request.Context(), authrouter.CurrentUserID(c), id)
	finish(c, fromThumbnailPointer(value), err)
}

func (h *Router) thumbnail(c *gin.Context) {
	id, ok := routeID(c)
	if !ok {
		return
	}
	content, err := h.service.OpenRendition(c.Request.Context(), authrouter.CurrentUserID(c), id, assetdomain.ThumbnailVersion, false)
	h.serveContent(c, content, false, err)
}

// 缓存协商发生在Service完成权限检查后，撤销访问后不能靠304继续读取。
func (h *Router) serveContent(c *gin.Context, content assetdto.Content, download bool, err error) {
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
