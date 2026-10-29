package compiler

import (
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/codec"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/syntax"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

type BoundField struct {
	Definition syntax.Field
	Slot       int
	Parts      []string
	Source     string
	Path       string
}

type Layout struct {
	Fields []BoundField
	ByPath map[string]BoundField
}

func NewLayout(schema syntax.Schema, limits diagnostic.Limits) (*Layout, error) {
	layout := &Layout{ByPath: map[string]BoundField{}}
	for _, source := range []string{"facts", "context"} {
		fields := schema.Facts
		if source == "context" {
			fields = schema.Context
		}
		paths := make([]string, 0, len(fields))
		for path := range fields {
			paths = append(paths, path)
		}
		sort.Strings(paths)
		for _, path := range paths {
			field := fields[path]
			if !field.Type.Valid() {
				return nil, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "unsupported field type")
			}
			if len(path) > limits.MaxStringBytes || !validPath(path) {
				return nil, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "invalid dotted field path")
			}
			parts := strings.Split(path, ".")
			if len(parts) > limits.MaxDepth {
				return nil, diagnostic.New(diagnostic.LimitExceeded, "$."+source+"."+path, "field path is too deep")
			}
			for i := 1; i < len(parts); i++ {
				if _, exists := fields[strings.Join(parts[:i], ".")]; exists {
					return nil, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "field overlaps a scalar ancestor")
				}
			}
			bound := BoundField{Definition: field, Slot: len(layout.Fields), Parts: parts, Source: source, Path: path}
			layout.Fields = append(layout.Fields, bound)
			layout.ByPath[source+"."+path] = bound
		}
	}
	if len(layout.Fields) > limits.MaxNodes {
		return nil, diagnostic.New(diagnostic.LimitExceeded, "$.schema", "too many fields")
	}
	return layout, nil
}

func validPath(path string) bool {
	for _, part := range strings.Split(path, ".") {
		if part == "" {
			return false
		}
		for i, c := range part {
			if c != '_' && !unicode.IsLetter(c) && !(i > 0 && unicode.IsDigit(c)) {
				return false
			}
		}
	}
	return true
}

func (l *Layout) Bind(facts, contextValues []byte, limits diagnostic.Limits) ([]value.Value, error) {
	if len(facts)+len(contextValues) > limits.MaxInputBytes {
		return nil, diagnostic.New(diagnostic.LimitExceeded, "$", "combined input exceeds byte limit")
	}
	inputs := map[string]map[string]any{}
	for _, source := range []string{"facts", "context"} {
		data := facts
		if source == "context" {
			data = contextValues
		}
		if len(data) == 0 {
			data = []byte("{}")
		}
		if err := codec.Validate(data, limits.MaxInputBytes, limits.MaxDepth+2, max(limits.MaxNodes, limits.MaxArrayLength), limits.MaxStringBytes); err != nil {
			return nil, err
		}
		var input map[string]any
		if err := codec.Decode(data, &input, "$."+source); err != nil {
			return nil, err
		}
		if input == nil {
			return nil, diagnostic.New(diagnostic.TypeMismatch, "$."+source, "input must be an object")
		}
		inputs[source] = input
	}
	values := make([]value.Value, len(l.Fields))
	for _, field := range l.Fields {
		var current any = inputs[field.Source]
		present := true
		path := "$." + field.Source + "." + field.Path
		for _, part := range field.Parts {
			object, ok := current.(map[string]any)
			if !ok {
				return nil, diagnostic.New(diagnostic.TypeMismatch, path, "field ancestor must be an object")
			}
			current, present = object[part]
			if !present {
				break
			}
		}
		if !present {
			if field.Definition.Required {
				return nil, diagnostic.New(diagnostic.MissingField, path, "required field is missing")
			}
			values[field.Slot] = value.MissingValue()
			continue
		}
		if current == nil && !field.Definition.Nullable {
			return nil, diagnostic.New(diagnostic.TypeMismatch, path, "field is not nullable")
		}
		normalized, err := value.Normalize(current, field.Definition.Type, limits, path)
		if err != nil {
			return nil, err
		}
		values[field.Slot] = normalized
	}
	return values, nil
}

func DecodeSchema(data []byte, limits diagnostic.Limits) (syntax.Schema, error) {
	var schema syntax.Schema
	if err := codec.Validate(data, limits.MaxRuleBytes, limits.MaxDepth+4, limits.MaxNodes, limits.MaxStringBytes); err != nil {
		return schema, err
	}
	if err := codec.Shape(data, "$", []string{"facts"}, "context"); err != nil {
		return schema, err
	}
	if err := codec.Decode(data, &schema, "$"); err != nil {
		return schema, err
	}
	// The struct decoder is case insensitive, so check each field object explicitly.
	var root map[string]map[string]any
	if err := codec.Decode(data, &root, "$"); err != nil {
		return schema, err
	}
	for source, fields := range root {
		if fields == nil {
			return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source, "field definitions must be an object")
		}
		for path, raw := range fields {
			definition, ok := raw.(map[string]any)
			if !ok {
				return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "field definition must be an object")
			}
			if _, exists := definition["type"]; !exists {
				return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "type is required")
			}
			for key, v := range definition {
				switch key {
				case "type":
					if _, ok := v.(string); !ok {
						return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "type must be a string")
					}
				case "required", "nullable":
					if _, ok := v.(bool); !ok {
						return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, "flags must be boolean")
					}
				default:
					return schema, diagnostic.New(diagnostic.InvalidSchema, "$."+source+"."+path, fmt.Sprintf("unexpected property %q", key))
				}
			}
		}
	}
	_, err := NewLayout(schema, limits)
	return schema, err
}
