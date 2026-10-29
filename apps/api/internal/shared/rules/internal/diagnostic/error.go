package diagnostic

import "fmt"

type Code string

const (
	InvalidJSON        Code = "invalid_json"
	UnsupportedVersion Code = "unsupported_version"
	InvalidNode        Code = "invalid_node"
	InvalidSchema      Code = "invalid_schema"
	UnknownField       Code = "unknown_field"
	UnknownOperator    Code = "unknown_operator"
	TypeMismatch       Code = "type_mismatch"
	MissingField       Code = "missing_field"
	LimitExceeded      Code = "limit_exceeded"
	CostExceeded       Code = "cost_exceeded"
	MultipleMatches    Code = "multiple_matches"
	InvalidBindings    Code = "invalid_bindings"
	Canceled           Code = "canceled"
	OperatorFailed     Code = "operator_failed"
)

type Error struct {
	Code    Code   `json:"code"`
	Path    string `json:"path"`
	Message string `json:"message"`
	Cause   error  `json:"-"`
}

func (e *Error) Error() string { return fmt.Sprintf("%s at %s: %s", e.Code, e.Path, e.Message) }
func (e *Error) Unwrap() error { return e.Cause }
func New(code Code, path, message string) *Error {
	return &Error{Code: code, Path: path, Message: message}
}

type Limits struct {
	MaxRuleBytes    int
	MaxInputBytes   int
	MaxDepth        int
	MaxNodes        int
	MaxRules        int
	MaxArrayLength  int
	MaxStringBytes  int
	MaxCost         int64
	MaxTraceEntries int
}

func (l Limits) WithDefaults() (Limits, error) {
	defaults := Limits{
		MaxRuleBytes:    1 << 20,
		MaxInputBytes:   1 << 20,
		MaxDepth:        16,
		MaxNodes:        4096,
		MaxRules:        128,
		MaxArrayLength:  1024,
		MaxStringBytes:  16 << 10,
		MaxCost:         1_000_000,
		MaxTraceEntries: 4096,
	}
	values := []*int{&l.MaxRuleBytes, &l.MaxInputBytes, &l.MaxDepth, &l.MaxNodes, &l.MaxRules, &l.MaxArrayLength, &l.MaxStringBytes, &l.MaxTraceEntries}
	fallbacks := []int{defaults.MaxRuleBytes, defaults.MaxInputBytes, defaults.MaxDepth, defaults.MaxNodes, defaults.MaxRules, defaults.MaxArrayLength, defaults.MaxStringBytes, defaults.MaxTraceEntries}
	for i, value := range values {
		if *value < 0 {
			return l, New(InvalidSchema, "$.limits", "limits must be positive")
		}
		if *value == 0 {
			*value = fallbacks[i]
		}
	}
	if l.MaxCost < 0 {
		return l, New(InvalidSchema, "$.limits.maxCost", "cost must be positive")
	}
	if l.MaxCost == 0 {
		l.MaxCost = defaults.MaxCost
	}
	// Recursive compilation/evaluation is bounded even for caller-supplied limits.
	if l.MaxDepth > 128 {
		return l, New(InvalidSchema, "$.limits.maxDepth", "maximum supported depth is 128")
	}
	return l, nil
}
