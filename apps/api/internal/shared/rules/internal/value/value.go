package value

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
)

type Type string

const (
	Boolean    Type = "boolean"
	String     Type = "string"
	NumberType Type = "number"
	Date       Type = "date"
	Timestamp  Type = "timestamp"
	Null       Type = "null"
	Missing    Type = "missing"
)

func (t Type) Element() Type { return Type(strings.TrimSuffix(string(t), "[]")) }
func (t Type) IsArray() bool { return strings.HasSuffix(string(t), "[]") }
func (t Type) Valid() bool {
	switch t.Element() {
	case Boolean, String, NumberType, Date, Timestamp:
		return true
	}
	return false
}
func (t Type) Ordered() bool {
	return !t.IsArray() && (t == String || t == NumberType || t == Date || t == Timestamp)
}

// Value is immutable; accessors never expose the backing slice.
type Value struct {
	typeOf  Type
	boolean bool
	text    string
	number  Number
	instant time.Time
	items   []Value
}

func (v Value) Type() Type      { return v.typeOf }
func (v Value) Bool() bool      { return v.boolean }
func (v Value) Text() string    { return v.text }
func (v Value) Number() Number  { return v.number }
func (v Value) Time() time.Time { return v.instant }
func (v Value) Len() int {
	if v.typeOf == String {
		return len(v.text)
	}
	return len(v.items)
}
func (v Value) At(i int) Value { return v.items[i] }
func MissingValue() Value      { return Value{typeOf: Missing} }

func Normalize(raw any, expected Type, limits diagnostic.Limits, path string) (Value, error) {
	if raw == nil {
		return Value{typeOf: Null}, nil
	}
	if expected == "" {
		switch raw.(type) {
		case bool:
			expected = Boolean
		case string:
			expected = String
		case json.Number:
			expected = NumberType
		case []any:
			items := raw.([]any)
			if len(items) == 0 {
				return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, "empty arrays need an explicit type")
			}
			first, err := Normalize(items[0], "", limits, path+"[0]")
			if err != nil {
				return Value{}, err
			}
			if !first.Type().Valid() || first.Type().IsArray() {
				return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, "arrays must contain non-null scalars")
			}
			expected = Type(string(first.Type()) + "[]")
		default:
			return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, "expected a scalar or homogeneous scalar array")
		}
	}
	v := Value{typeOf: expected}
	mismatch := func() (Value, error) {
		return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, "expected "+string(expected))
	}
	if expected.IsArray() {
		items, ok := raw.([]any)
		if !ok {
			return mismatch()
		}
		if len(items) > limits.MaxArrayLength {
			return Value{}, diagnostic.New(diagnostic.LimitExceeded, path, "array is too long")
		}
		v.items = make([]Value, len(items))
		for i, item := range items {
			if item == nil {
				return mismatch()
			}
			normalized, err := Normalize(item, expected.Element(), limits, fmt.Sprintf("%s[%d]", path, i))
			if err != nil {
				return Value{}, err
			}
			v.items[i] = normalized
		}
		return v, nil
	}
	switch expected {
	case Boolean:
		b, ok := raw.(bool)
		if !ok {
			return mismatch()
		}
		v.boolean = b
	case NumberType:
		n, ok := raw.(json.Number)
		if !ok {
			return mismatch()
		}
		parsed, err := ParseNumber(string(n))
		if err != nil {
			return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, err.Error())
		}
		v.number = parsed
	case String, Date, Timestamp:
		s, ok := raw.(string)
		if !ok {
			return mismatch()
		}
		if len(s) > limits.MaxStringBytes {
			return Value{}, diagnostic.New(diagnostic.LimitExceeded, path, "string is too long")
		}
		v.text = s
		if expected == Date || expected == Timestamp {
			parsed, err := parseTemporal(s, expected)
			if err != nil {
				return Value{}, diagnostic.New(diagnostic.TypeMismatch, path, "invalid "+string(expected))
			}
			v.instant = parsed
		}
	default:
		return mismatch()
	}
	return v, nil
}

func Compare(a, b Value) int {
	switch a.typeOf {
	case NumberType:
		return a.number.Compare(b.number)
	case String:
		return strings.Compare(a.text, b.text)
	case Date, Timestamp:
		return a.instant.Compare(b.instant)
	case Boolean:
		if a.boolean == b.boolean {
			return 0
		}
		if a.boolean {
			return 1
		}
		return -1
	}
	return 0
}

func Equal(a, b Value) bool {
	if a.typeOf != b.typeOf {
		return false
	}
	if a.typeOf.IsArray() {
		if len(a.items) != len(b.items) {
			return false
		}
		for i := range a.items {
			if !Equal(a.items[i], b.items[i]) {
				return false
			}
		}
		return true
	}
	return Compare(a, b) == 0
}

func (v Value) Key() string {
	switch v.typeOf {
	case NumberType:
		return v.number.String()
	case Boolean:
		if v.boolean {
			return "true"
		}
		return "false"
	case Date, Timestamp:
		return v.instant.UTC().Format(time.RFC3339Nano)
	default:
		return v.text
	}
}

// Work is a conservative charge for one full traversal or scalar comparison.
func (v Value) Work() int64 {
	if v.typeOf.IsArray() {
		var n int64 = 1
		for _, item := range v.items {
			n += item.Work()
		}
		return n
	}
	if v.typeOf == String {
		return int64(len(v.text)) + 1
	}
	if v.typeOf == NumberType {
		return int64(len(v.number.digits)) + 1
	}
	return 1
}
