package todos

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func ValidText(value string, min, max int) bool {
	n := utf8.RuneCountInString(value)
	return utf8.ValidString(value) && n >= min && n <= max
}

func ParseID(value string) (int64, error) {
	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id <= 0 || strconv.FormatInt(id, 10) != value {
		return 0, ErrInvalid
	}
	return id, nil
}

func ParseDate(raw json.RawMessage, current *time.Time) (*time.Time, error) {
	if len(raw) == 0 {
		return current, nil
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var text string
	if json.Unmarshal(raw, &text) != nil {
		return nil, ErrInvalid
	}
	date, err := time.Parse(time.DateOnly, text)
	if err != nil || date.Year() < 1 {
		return nil, ErrInvalid
	}
	return &date, nil
}

func NormalizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if !ValidText(name, 1, 100) {
		return "", ErrInvalid
	}
	return name, nil
}
