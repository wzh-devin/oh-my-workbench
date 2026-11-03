package logging

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type capture struct {
	data []byte
	read int64
}

func (b *capture) add(p []byte) {
	b.read += int64(len(p))
	remaining := maxBodyBytes - len(b.data)
	if len(p) > remaining {
		p = p[:remaining]
	}
	b.data = append(b.data, p...)
}

func (b *capture) value(contentType string, complete bool) any {
	media, _, _ := mime.ParseMediaType(contentType)
	switch {
	case b.read > maxBodyBytes:
		return map[string]any{"omitted": "size_limit", "bytes": b.read}
	case !complete:
		return map[string]any{"omitted": "not_fully_read", "bytes": b.read}
	case b.read == 0:
		return nil
	case media == "application/json" || strings.HasSuffix(media, "+json"):
		if value, err := decodeJSON(b.data); err == nil && json.Valid(b.data) {
			return redact(value, 0)
		}
		return map[string]any{"omitted": "invalid_json", "bytes": b.read}
	case media == "application/x-www-form-urlencoded":
		if values, err := url.ParseQuery(string(b.data)); err == nil {
			return queryValues(values)
		}
	}
	return map[string]any{"omitted": "content_type", "content_type": media, "bytes": b.read}
}

type requestCapture struct {
	io.ReadCloser
	capture
	eof bool
}

func (b *requestCapture) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.add(p[:n])
	if errors.Is(err, io.EOF) {
		b.eof = true
	}
	return n, err
}

type responseCapture struct {
	gin.ResponseWriter
	capture
}

func (w *responseCapture) Write(p []byte) (int, error) {
	n, err := w.ResponseWriter.Write(p)
	w.add(p[:n])
	return n, err
}

func (w *responseCapture) WriteString(p string) (int, error) { return w.Write([]byte(p)) }

// MetadataOnly marks raw file endpoints even if the client labels a file as JSON.
func MetadataOnly(c *gin.Context) { c.Set("logging.metadata_only", true); c.Next() }

// SensitiveBody excludes both directions; arbitrary Markdown cannot be redacted by field names.
func SensitiveBody(c *gin.Context) { c.Set("logging.sensitive_body", true); c.Next() }

// HTTP only observes bytes consumed by handlers; Flush and download methods remain available.
func HTTP() gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		id := rand.Text()
		// Preformat shared fields once for HTTP, SQL and error records.
		logger := slog.Default().With("request_id", id, "method", c.Request.Method, "path", c.Request.URL.Path, "client_ip", c.ClientIP())
		ctx := context.WithValue(c.Request.Context(), requestKey{}, requestLog{id, logger})
		c.Request = c.Request.WithContext(ctx)
		c.Header("X-Request-ID", RequestID(ctx))
		body := &requestCapture{ReadCloser: c.Request.Body}
		if c.Request.Body != nil {
			c.Request.Body = body
		}
		writer := &responseCapture{ResponseWriter: c.Writer}
		c.Writer = writer
		sensitiveRoute := c.Request.URL.Path == "/api/notes" || strings.HasPrefix(c.Request.URL.Path, "/api/notes/")
		var query any = map[string]any{"omitted": "size_limit"}
		if sensitiveRoute {
			query = map[string]any{"omitted": "sensitive_route"}
		} else if len(c.Request.URL.RawQuery) <= maxBodyBytes {
			query = queryValues(c.Request.URL.Query())
		}
		logger.InfoContext(ctx, "http.request", "started_at", started, "query", query)
		defer func() {
			panicked := false
			if value := recover(); value != nil {
				panicked = true
				Error(ctx, "http.panic", fmt.Errorf("%v", value))
				if !writer.Written() {
					c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "服务暂不可用，请重试", "data": nil})
				} else {
					c.Abort()
				}
			}
			finished := time.Now()
			for _, failure := range c.Errors {
				Error(ctx, "http.handler_failed", failure.Err)
			}
			level := slog.LevelInfo
			if panicked || len(c.Errors) > 0 || writer.Status() >= 500 {
				level = slog.LevelError
			} else if writer.Status() >= 400 {
				level = slog.LevelWarn
			}
			complete := c.Request.Body == nil || body.eof || (c.Request.ContentLength >= 0 && body.read == c.Request.ContentLength)
			responseBody := writer.value(writer.Header().Get("Content-Type"), true)
			requestBody := body.value(c.GetHeader("Content-Type"), complete)
			if c.GetBool("logging.metadata_only") {
				requestBody = map[string]any{"omitted": "file_request", "bytes": body.read}
			}
			if writer.Header().Get("Content-Disposition") != "" {
				responseBody = map[string]any{"omitted": "file_response", "bytes": writer.read}
			}
			if sensitiveRoute || c.GetBool("logging.sensitive_body") {
				requestBody = map[string]any{"omitted": "sensitive_body", "bytes": body.read}
				responseBody = map[string]any{"omitted": "sensitive_body", "bytes": writer.read}
			}
			logger.Log(ctx, level, "http.response", "started_at", started, "finished_at", finished,
				"panic", panicked,
				"duration_ms", float64(finished.Sub(started))/float64(time.Millisecond), "status", writer.Status(),
				"request_body", requestBody, "response_body", responseBody,
				"request_bytes", body.read, "response_bytes", writer.read)
		}()
		c.Next()
	}
}
