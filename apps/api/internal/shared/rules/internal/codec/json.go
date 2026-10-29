package codec

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"unicode/utf8"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
)

// Validate rejects duplicate keys as well as excessive nesting before decoding structs.
func Validate(data []byte, maxBytes, maxDepth, maxItems, maxString int) error {
	if len(data) > maxBytes {
		return diagnostic.New(diagnostic.LimitExceeded, "$", "JSON exceeds byte limit")
	}
	if !utf8.Valid(data) {
		return diagnostic.New(diagnostic.InvalidJSON, "$", "invalid UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	if err := scan(d, 0, maxDepth, maxItems, maxString); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return diagnostic.New(diagnostic.InvalidJSON, "$", "expected one JSON value")
	}
	return nil
}

func scan(d *json.Decoder, depth, maxDepth, maxItems, maxString int) error {
	if depth > maxDepth {
		return diagnostic.New(diagnostic.LimitExceeded, "$", "JSON nesting exceeds limit")
	}
	token, err := d.Token()
	if err != nil {
		return diagnostic.New(diagnostic.InvalidJSON, "$", err.Error())
	}
	if text, ok := token.(string); ok && len(text) > maxString {
		return diagnostic.New(diagnostic.LimitExceeded, "$", "string exceeds limit")
	}
	delim, ok := token.(json.Delim)
	if !ok {
		return nil
	}
	if delim != '{' && delim != '[' {
		return diagnostic.New(diagnostic.InvalidJSON, "$", "unexpected closing delimiter")
	}
	keys := map[string]struct{}{}
	count := 0
	for d.More() {
		count++
		if count > maxItems {
			return diagnostic.New(diagnostic.LimitExceeded, "$", "container exceeds item limit")
		}
		if delim == '{' {
			key, err := d.Token()
			if err != nil {
				return diagnostic.New(diagnostic.InvalidJSON, "$", err.Error())
			}
			name, ok := key.(string)
			if !ok {
				return diagnostic.New(diagnostic.InvalidJSON, "$", "object key must be a string")
			}
			if len(name) > maxString {
				return diagnostic.New(diagnostic.LimitExceeded, "$", "key exceeds limit")
			}
			if _, exists := keys[name]; exists {
				return diagnostic.New(diagnostic.InvalidJSON, "$", "duplicate key: "+name)
			}
			keys[name] = struct{}{}
		}
		if err := scan(d, depth+1, maxDepth, maxItems, maxString); err != nil {
			return err
		}
	}
	if _, err := d.Token(); err != nil {
		return diagnostic.New(diagnostic.InvalidJSON, "$", err.Error())
	}
	return nil
}

func Decode(data []byte, target any, path string) error {
	d := json.NewDecoder(bytes.NewReader(data))
	d.UseNumber()
	d.DisallowUnknownFields()
	if err := d.Decode(target); err != nil {
		return diagnostic.New(diagnostic.InvalidJSON, path, err.Error())
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return diagnostic.New(diagnostic.InvalidJSON, path, "expected one JSON value")
	}
	return nil
}

// Shape enforces exact, case-sensitive property names and presence per node kind.
func Shape(data []byte, path string, required []string, optional ...string) error {
	var fields map[string]json.RawMessage
	if err := Decode(data, &fields, path); err != nil {
		return err
	}
	if fields == nil {
		return diagnostic.New(diagnostic.InvalidNode, path, "expected an object")
	}
	allowed := make(map[string]bool, len(required)+len(optional))
	for _, key := range required {
		allowed[key] = true
		if _, ok := fields[key]; !ok {
			return diagnostic.New(diagnostic.InvalidNode, path+"."+key, "required property")
		}
	}
	for _, key := range optional {
		allowed[key] = true
	}
	for key := range fields {
		if !allowed[key] {
			return diagnostic.New(diagnostic.InvalidNode, path+"."+key, fmt.Sprintf("unexpected property %q", key))
		}
	}
	return nil
}
