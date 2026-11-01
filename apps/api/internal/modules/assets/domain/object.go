package domain

import (
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

// 对象路径只由已校验的连接和内容标识生成，逻辑目录不参与对象定位。
var objectExtension = regexp.MustCompile(`^\.[a-z0-9]{1,12}$`)

func ObjectKey(c Connection, blobID int64, name string) string {
	extension := strings.ToLower(filepath.Ext(name))
	if !objectExtension.MatchString(extension) {
		extension = ".bin"
	}
	return path.Join(c.Prefix, FormatID(c.UserID), FormatID(blobID), "original"+extension)
}
