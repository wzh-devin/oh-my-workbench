// Package logging owns structured, bounded file logs for the API and renderer.
package logging

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime/debug"

	"github.com/jackc/pgx/v5/pgconn"
	"gopkg.in/natefinch/lumberjack.v2"
)

const Directory = "logs"

type requestKey struct{}
type requestLog struct {
	id     string
	logger *slog.Logger
}

func RequestID(ctx context.Context) string {
	if request, ok := ctx.Value(requestKey{}).(requestLog); ok {
		return request.id
	}
	return ""
}

func FromContext(ctx context.Context) *slog.Logger {
	if request, ok := ctx.Value(requestKey{}).(requestLog); ok {
		return request.logger
	}
	return slog.Default()
}

// Error captures the current failure site; it does not change the caller's response.
func Error(ctx context.Context, message string, err error, attrs ...any) {
	value := scrubText(fmt.Sprint(err))
	var parseError *pgconn.ParseConfigError
	if errors.As(err, &parseError) {
		value = "数据库连接配置格式无效（连接信息已隐藏）"
	}
	attrs = append(attrs, "error", value, "error_type", fmt.Sprintf("%T", err), "stack", string(debug.Stack()))
	FromContext(ctx).ErrorContext(ctx, message, attrs...)
}

func rotation(path string) *lumberjack.Logger {
	return &lumberjack.Logger{Filename: path, MaxSize: 50, MaxBackups: 5, MaxAge: 7}
}

func openFile(path string) (*os.File, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	if err := file.Chmod(0600); err != nil {
		_ = file.Close()
		return nil, err
	}
	return file, nil
}

type fileWriter struct{ file io.Writer }

func (w fileWriter) Write(p []byte) (int, error) {
	n, err := w.file.Write(p)
	if err != nil {
		fmt.Fprintln(os.Stderr, "日志文件写入失败:", err)
	}
	return n, err
}

func initLogger(component string) (func(), error) {
	if err := os.MkdirAll(Directory, 0750); err != nil {
		return nil, err
	}
	path := filepath.Join(Directory, component+".log")
	file, err := openFile(path)
	if err != nil {
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	writer := rotation(path)
	options := slog.HandlerOptions{
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if sensitive(a.Key) {
				return slog.String(a.Key, redacted)
			}
			switch a.Key {
			case "sql", "file", "function", "service", "request_id", "method", "client_ip":
				return a
			}
			if a.Value.Kind() == slog.KindString {
				a.Value = slog.StringValue(scrubText(a.Value.String()))
			}
			return a
		},
	}
	consoleOptions := options
	consoleOptions.Level = slog.LevelWarn
	logger := slog.New(slog.NewMultiHandler(
		slog.NewJSONHandler(fileWriter{writer}, &options),
		slog.NewJSONHandler(os.Stdout, &consoleOptions),
	)).With("service", component)

	// Runtime panics in other goroutines bypass slog; preserve their original stack.
	crashPath := filepath.Join(Directory, component+"-crash.log")
	crashRotation := rotation(crashPath)
	if info, err := os.Stat(crashPath); err == nil && info.Size() >= 50<<20 {
		if err := crashRotation.Rotate(); err != nil {
			_ = writer.Close()
			return nil, err
		}
	}
	_ = crashRotation.Close()
	crash, err := openFile(crashPath)
	if err != nil {
		_ = writer.Close()
		return nil, err
	}
	err = debug.SetCrashOutput(crash, debug.CrashOptions{})
	closeErr := crash.Close() // SetCrashOutput retains its own descriptor.
	if err != nil || closeErr != nil {
		_ = writer.Close()
		return nil, errors.Join(err, closeErr)
	}
	slog.SetDefault(logger)
	return func() {
		_ = debug.SetCrashOutput(nil, debug.CrashOptions{})
		if err := writer.Close(); err != nil {
			fmt.Fprintln(os.Stderr, "关闭日志文件失败:", err)
		}
	}, nil
}

// Run lets main use os.Exit without skipping log cleanup or startup panic capture.
func Run(component string, run func() error) (exitCode int) {
	closeLogs, err := initLogger(component)
	if err != nil {
		fmt.Fprintln(os.Stderr, "初始化日志失败:", err)
		return 1
	}
	defer closeLogs()
	defer func() {
		if value := recover(); value != nil {
			Error(context.Background(), "service.panic", fmt.Errorf("%v", value))
			exitCode = 1
		}
	}()
	slog.Info("service.starting")
	if err := run(); err != nil {
		Error(context.Background(), "service.failed", err)
		return 1
	}
	slog.Info("service.stopped")
	return 0
}
