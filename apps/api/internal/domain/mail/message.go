package mail

import "strings"

const BodyFormatVersion = 2

func Preview(body string) string {
	value := []rune(strings.Join(strings.Fields(body), " "))
	if len(value) > 160 {
		value = value[:160]
	}
	return string(value)
}
