// 视频探测/截帧仅允许 file/pipe 协议，固定命令参数与解码资源边界。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

func videoImage(ctx context.Context, source, contentType, directory string) (string, error) {
	probe := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration,format_name", "-of", "json", source)
	data, err := probe.Output()
	if err != nil {
		return "", err
	}
	var metadata struct {
		Streams []struct{ Width, Height int }
		Format  struct {
			Duration string
			Name     string `json:"format_name"`
		}
	}
	if json.Unmarshal(data, &metadata) != nil || len(metadata.Streams) != 1 {
		return "", fmt.Errorf("video stream unavailable")
	}
	allowed := map[string]string{"video/quicktime": "mov,mp4,m4a,3gp,3g2,mj2", "video/mp4": "mov,mp4,m4a,3gp,3g2,mj2", "video/webm": "matroska,webm", "video/x-msvideo": "avi"}
	frame := metadata.Streams[0]
	if metadata.Format.Name != allowed[contentType] || frame.Width <= 0 || frame.Height <= 0 || int64(frame.Width) > 50_000_000/int64(frame.Height) {
		return "", fmt.Errorf("video format or pixel limit")
	}
	seek := 0.0
	if duration, err := strconv.ParseFloat(metadata.Format.Duration, 64); err == nil && duration > 0 {
		seek = min(1, duration/10)
	}
	output := filepath.Join(directory, "frame.png")
	command := exec.CommandContext(ctx, "ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-threads", "1", "-ss", strconv.FormatFloat(seek, 'f', 3, 64), "-i", source, "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=w='min(512,iw)':h='min(512,ih)':force_original_aspect_ratio=decrease", "-threads", "1", output)
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return "", ctx.Err()
		}
		return "", fmt.Errorf("video frame unavailable: %s", strings.TrimPrefix(contentType, "video/"))
	}
	return output, nil
}
