package value

import (
	"fmt"
	"regexp"
	"strconv"
	"time"
)

var timestampPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$`)

func parseTemporal(text string, kind Type) (time.Time, error) {
	if kind == Date {
		return time.Parse(time.DateOnly, text)
	}
	if !timestampPattern.MatchString(text) {
		return time.Time{}, fmt.Errorf("expected RFC3339 with at most nanosecond precision")
	}
	if text[len(text)-1] != 'Z' {
		hours, _ := strconv.Atoi(text[len(text)-5 : len(text)-3])
		minutes, _ := strconv.Atoi(text[len(text)-2:])
		if hours > 23 || minutes > 59 {
			return time.Time{}, fmt.Errorf("invalid timezone offset")
		}
	}
	return time.Parse(time.RFC3339Nano, text)
}
