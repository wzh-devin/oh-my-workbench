// Package rules compiles typed, side-effect-free JSON conditions into reusable programs.
package rules

import (
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/decision"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/operator"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/syntax"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

type (
	Schema         = syntax.Schema
	Field          = syntax.Field
	Type           = value.Type
	Value          = value.Value
	Limits         = diagnostic.Limits
	Error          = diagnostic.Error
	Code           = diagnostic.Code
	Operator       = operator.Operator
	Argument       = eval.Argument
	Predicate      = eval.Predicate
	Evaluation     = eval.Evaluation
	EvalOptions    = eval.Options
	Result         = eval.Result
	TraceEntry     = eval.TraceEntry
	DecisionResult = decision.Result
	Match          = decision.Match
)

const (
	Boolean            = value.Boolean
	String             = value.String
	Number             = value.NumberType
	Date               = value.Date
	Timestamp          = value.Timestamp
	Null               = value.Null
	Missing            = value.Missing
	InvalidJSON        = diagnostic.InvalidJSON
	UnsupportedVersion = diagnostic.UnsupportedVersion
	InvalidNode        = diagnostic.InvalidNode
	InvalidSchema      = diagnostic.InvalidSchema
	UnknownField       = diagnostic.UnknownField
	UnknownOperator    = diagnostic.UnknownOperator
	TypeMismatch       = diagnostic.TypeMismatch
	MissingField       = diagnostic.MissingField
	LimitExceeded      = diagnostic.LimitExceeded
	CostExceeded       = diagnostic.CostExceeded
	MultipleMatches    = diagnostic.MultipleMatches
	InvalidBindings    = diagnostic.InvalidBindings
	Canceled           = diagnostic.Canceled
	OperatorFailed     = diagnostic.OperatorFailed
)

type Config struct {
	Schema    Schema
	Operators []Operator
	Limits    Limits
}
