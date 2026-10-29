package response

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	SUCCESS = "success"
	ERROR   = "error"
)

type ApiResult struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// Success 成功
func Success(c *gin.Context, data any) {
	c.JSON(http.StatusOK, ApiResult{
		Code:    0,
		Message: SUCCESS,
		Data:    data,
	})
}

// Fail 失败
func Fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, ApiResult{
		Code:    status,
		Message: message,
		Data:    nil,
	})
}
