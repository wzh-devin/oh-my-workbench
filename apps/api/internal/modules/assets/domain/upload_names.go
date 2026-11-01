package domain

import (
	"strconv"
	"strings"
)

// 上传名称冲突的建议规则；独立于内容对象，始终保留已有文件。
type UploadNameConflict struct {
	SuggestedName string `json:"suggestedName"`
}

func (e *UploadNameConflict) Error() string { return ErrName.Error() }

func (e *UploadNameConflict) Unwrap() error { return ErrName }

// UploadName 识别已有副本标识，保留扩展名并遵守 200 字符上限。
func UploadName(name string, occupied map[string]bool) string {
	if !occupied[NormalizeName(name)] {
		return name
	}
	stem, extension := FileNameParts(name)
	index := 1
	if marker := strings.LastIndex(stem, "_副本"); marker >= 0 {
		number := stem[marker+len("_副本"):]
		if number == "" {
			stem, index = stem[:marker], 2
		} else if previous, err := strconv.ParseInt(number, 10, 32); err == nil && previous >= 2 {
			stem, index = stem[:marker], int(previous)+1
		}
	}
	for ; ; index++ {
		suffix := "_副本"
		if index > 1 {
			suffix += strconv.Itoa(index)
		}
		ext := []rune(extension)
		ext = ext[:min(len(ext), 199-len([]rune(suffix)))]
		base := []rune(stem)
		limit := 200 - len([]rune(suffix)) - len(ext)
		candidate := string(base[:min(len(base), limit)]) + suffix + string(ext)
		if !occupied[NormalizeName(candidate)] {
			return candidate
		}
	}
}

// FileNameParts 与前端原位重命名使用相同的后缀边界。
func FileNameParts(name string) (stem, extension string) {
	stem = name
	if dot := strings.LastIndex(name, "."); dot > 0 {
		stem, extension = name[:dot], name[dot:]
	}
	for _, suffix := range []string{".tar.gz", ".tar.bz2", ".tar.xz", ".tar.zst"} {
		if strings.HasSuffix(strings.ToLower(name), suffix) && len(name) > len(suffix) {
			stem, extension = name[:len(name)-len(suffix)], name[len(name)-len(suffix):]
			break
		}
	}
	return stem, extension
}
