// 私有缩略图渲染入口：只接收文件流，固定规格输出，不接收URL或存储凭证。
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/platform/logging"
)

const maxSourceBytes = 100 << 20
const maxOutputBytes = 2 << 20

func main() {
	address := flag.String("listen", ":8080", "HTTP listen address")
	flag.Parse()
	os.Exit(logging.Run("renderer", func() error { return run(*address) }))
}

func run(address string) error {
	for _, command := range []string{"vipsheader", "vipsthumbnail", "ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(command); err != nil {
			return err
		}
	}
	server := &http.Server{Addr: address, Handler: renderer(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 35 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8 << 10,
		ErrorLog: slog.NewLogLogger(slog.Default().Handler(), slog.LevelError)}
	return server.ListenAndServe()
}

func renderer() http.Handler {
	seats := make(chan struct{}, 2)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("POST /thumbnail", func(w http.ResponseWriter, r *http.Request) {
		select {
		case seats <- struct{}{}:
			defer func() { <-seats }()
		default:
			http.Error(w, "renderer busy", http.StatusServiceUnavailable)
			return
		}
		if err := render(w, r); err != nil {
			logging.Error(r.Context(), "renderer.failed", err, "path", r.URL.Path)
			status := http.StatusUnprocessableEntity
			var limit *http.MaxBytesError
			if errors.As(err, &limit) {
				status = http.StatusRequestEntityTooLarge
			} else if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
				status = http.StatusGatewayTimeout
			}
			// 不返回解析器输出或临时文件路径。
			http.Error(w, "thumbnail unavailable", status)
		}
	})
	return mux
}

func render(w http.ResponseWriter, r *http.Request) error {
	contentType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil {
		return err
	}
	extension := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "application/pdf": ".pdf", "video/quicktime": ".mov", "video/mp4": ".mp4", "video/webm": ".webm", "video/x-msvideo": ".avi", "text/plain": ".txt", "text/csv": ".csv", "text/tab-separated-values": ".tsv"}[contentType]
	if extension == "" {
		http.Error(w, "unsupported media type", http.StatusUnsupportedMediaType)
		return nil
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	directory, err := os.MkdirTemp("", "asset-thumbnail-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(directory)
	source := filepath.Join(directory, "source"+extension)
	file, err := os.OpenFile(source, os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	limit := int64(maxSourceBytes)
	if strings.HasPrefix(contentType, "image/") {
		limit = 32 << 20
	}
	if strings.HasPrefix(contentType, "text/") {
		limit = 512 << 10
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	written, copyErr := io.Copy(file, r.Body)
	closeErr := file.Close()
	if copyErr != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return copyErr
	}
	if closeErr != nil || written == 0 {
		return fmt.Errorf("empty or unwritable source")
	}
	header := make([]byte, 512)
	check, err := os.Open(source)
	if err != nil {
		return err
	}
	n, readErr := check.Read(header)
	check.Close()
	if readErr != nil && readErr != io.EOF || (!strings.HasPrefix(contentType, "text/") && !strings.HasPrefix(contentType, "video/") && http.DetectContentType(header[:n]) != contentType) {
		return fmt.Errorf("source type mismatch")
	}
	// 文件名由服务端创建，固定参数直接exec，原文件名和请求内容不能成为命令参数。
	input := source
	if strings.HasPrefix(contentType, "text/") {
		input, err = textImage(source, contentType, directory)
		if err != nil {
			return err
		}
	} else if strings.HasPrefix(contentType, "video/") {
		input, err = videoImage(ctx, source, contentType, directory)
		if err != nil {
			return err
		}
	}
	if extension == ".pdf" {
		input += "[page=0,n=1]"
	}
	width, height, err := dimensions(ctx, input)
	if err != nil {
		return err
	}
	if width <= 0 || height <= 0 || int64(width) > 50_000_000/int64(height) {
		return fmt.Errorf("source pixel limit")
	}
	output := filepath.Join(directory, "thumbnail.webp")
	command := exec.CommandContext(ctx, "vipsthumbnail", input, "--size", "512x512>", "--output", output+"[Q=80,strip]", "--vips-concurrency", "1", "--vips-cache-max-memory", "33554432")
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return err
	}
	width, height, err = dimensions(ctx, output)
	if err != nil || width <= 0 || height <= 0 || width > 512 || height > 512 {
		return fmt.Errorf("invalid output dimensions")
	}
	image, err := os.Open(output)
	if err != nil {
		return err
	}
	defer image.Close()
	info, err := image.Stat()
	if err != nil || info.Size() <= 0 || info.Size() > maxOutputBytes {
		return fmt.Errorf("output size limit")
	}
	w.Header().Set("Content-Type", "image/webp")
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, err = io.Copy(w, image)
	return err
}

// 先读首帧/首页头信息再渲染，拒绝像素炸弹；输出也重新核验尺寸。
func dimensions(ctx context.Context, input string) (int, int, error) {
	command := exec.CommandContext(ctx, "vipsheader", input)
	header, err := command.Output()
	if err != nil {
		if ctx.Err() != nil {
			return 0, 0, ctx.Err()
		}
		return 0, 0, err
	}
	_, value, ok := strings.Cut(string(header), ": ")
	width, height := 0, 0
	if !ok {
		return 0, 0, fmt.Errorf("invalid image header")
	}
	_, err = fmt.Sscanf(value, "%dx%d", &width, &height)
	return width, height, err
}
