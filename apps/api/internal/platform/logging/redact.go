package logging

import (
	"bytes"
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
	"unicode"
)

const maxBodyBytes = 8 << 10
const redacted = "[REDACTED]"

var userinfo = regexp.MustCompile(`([a-zA-Z][a-zA-Z0-9+.-]*://)[^\s/@"'<>]+@`)
var secretText = regexp.MustCompile(`(?i)(password|passwd|token|secret|credential|api[_-]?key|access[_-]?key|authorization|cookie|x-amz-signature)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)`)
var bearer = regexp.MustCompile(`(?i)\bBearer\s+[a-z0-9._~+/=-]+`)

func sensitive(name string) bool {
	name = strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, name)
	for _, part := range []string{"password", "passwd", "secret", "token", "authorization", "cookie", "credential", "privatekey", "encryptionkey", "accesskey", "apikey", "signature"} {
		if strings.Contains(name, part) {
			return true
		}
	}
	return name == "auth" || name == "p256dh" || name == "pwd"
}

func scrubText(value string) string {
	value = userinfo.ReplaceAllString(value, "${1}"+redacted+"@")
	value = bearer.ReplaceAllString(value, "Bearer "+redacted)
	return secretText.ReplaceAllString(value, "${1}${2}"+redacted)
}

func decodeJSON(data []byte) (any, error) {
	var value any
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	err := decoder.Decode(&value)
	return value, err
}

func redact(value any, depth int) any {
	if depth > 16 {
		return "[OMITTED: nesting limit]"
	}
	switch value := value.(type) {
	case map[string]any:
		for key, item := range value {
			if sensitive(key) {
				value[key] = redacted
			} else {
				value[key] = redact(item, depth+1)
			}
		}
	case []any:
		for i := range value {
			value[i] = redact(value[i], depth+1)
		}
	case string:
		// Structured strings may contain a credential URL or a JSON-encoded value.
		if parsed, err := url.Parse(value); err == nil && parsed.Scheme != "" && parsed.Host != "" {
			if parsed.User != nil {
				parsed.User = url.User(redacted)
			}
			if parsed.RawQuery != "" {
				query := parsed.Query()
				for key := range query {
					if sensitive(key) {
						query.Set(key, redacted)
					}
				}
				parsed.RawQuery = query.Encode()
			}
			return scrubText(parsed.String())
		}
		if json.Valid([]byte(value)) && (strings.HasPrefix(value, "{") || strings.HasPrefix(value, "[")) {
			if nested, err := decodeJSON([]byte(value)); err == nil {
				return redact(nested, depth+1)
			}
		}
		return scrubText(value)
	}
	return value
}

func queryValues(values url.Values) any {
	out := make(map[string]any, len(values))
	for key, values := range values {
		items := make([]any, len(values))
		for i, value := range values {
			items[i] = value
		}
		out[key] = items
	}
	return redact(out, 0)
}
