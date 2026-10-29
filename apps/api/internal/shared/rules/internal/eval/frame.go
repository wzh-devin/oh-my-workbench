package eval

import (
	"context"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

type Argument struct {
	ValueType value.Type
	Literal   value.Value
	Slot      int
	IsLiteral bool
	Path      string
}

func (a Argument) Type() value.Type              { return a.ValueType }
func (a Argument) Constant() (value.Value, bool) { return a.Literal, a.IsLiteral }
func (a Argument) Optional(e *Evaluation) value.Value {
	if a.IsLiteral {
		return a.Literal
	}
	return e.values[a.Slot]
}
func (a Argument) Read(e *Evaluation) (value.Value, error) {
	v := a.Optional(e)
	if v.Type() == value.Missing {
		return v, diagnostic.New(diagnostic.MissingField, a.Path, "optional field is missing; use exists to guard it")
	}
	return v, nil
}

type Predicate func(*Evaluation) (bool, error)

// Evaluation belongs to a single call. Custom predicates must cooperate with Charge.
type Evaluation struct {
	ctx    context.Context
	values []value.Value
	limit  int64
	cost   int64
	path   string
}

func NewEvaluation(ctx context.Context, values []value.Value, maxCost int64) *Evaluation {
	return &Evaluation{ctx: ctx, values: values, limit: maxCost}
}
func (e *Evaluation) Context() context.Context { return e.ctx }
func (e *Evaluation) Cost() int64              { return e.cost }
func (e *Evaluation) Charge(cost int64) error {
	if err := e.ctx.Err(); err != nil {
		return &diagnostic.Error{Code: diagnostic.Canceled, Path: e.path, Message: err.Error(), Cause: err}
	}
	if cost < 0 || cost > e.limit-e.cost {
		return diagnostic.New(diagnostic.CostExceeded, e.path, "evaluation cost limit exceeded")
	}
	e.cost += cost
	return nil
}
