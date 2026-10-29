package rules

import (
	"context"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/compiler"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/decision"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/operator"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

// Engine is immutable after construction. Compile and BindJSON are safe concurrently.
type Engine struct {
	compiler compiler.Compiler
	limits   Limits
}

type Program struct {
	engine  *Engine
	program *eval.Program
}
type DecisionProgram struct {
	engine  *Engine
	program *decision.Program
}
type Bindings struct {
	engine *Engine
	values []value.Value
}

func NewEngine(config Config) (*Engine, error) {
	limits, err := config.Limits.WithDefaults()
	if err != nil {
		return nil, err
	}
	layout, err := compiler.NewLayout(config.Schema, limits)
	if err != nil {
		return nil, err
	}
	registry, err := operator.Registry(config.Operators)
	if err != nil {
		return nil, &Error{Code: InvalidSchema, Path: "$.operators", Message: err.Error(), Cause: err}
	}
	return &Engine{compiler: compiler.Compiler{Layout: layout, Operators: registry, Limits: limits}, limits: limits}, nil
}

func DecodeSchema(data []byte) (Schema, error) {
	limits, _ := (Limits{}).WithDefaults()
	return compiler.DecodeSchema(data, limits)
}

func (e *Engine) Compile(data []byte) (*Program, error) {
	compiled, err := e.compiler.Compile(data)
	if err != nil {
		return nil, err
	}
	return &Program{engine: e, program: compiled}, nil
}

func (e *Engine) CompileSet(data []byte) (*DecisionProgram, error) {
	compiled, err := decision.Compile(&e.compiler, data)
	if err != nil {
		return nil, err
	}
	return &DecisionProgram{engine: e, program: compiled}, nil
}

func (e *Engine) BindJSON(facts, contextValues []byte) (*Bindings, error) {
	values, err := e.compiler.Layout.Bind(facts, contextValues, e.limits)
	if err != nil {
		return nil, err
	}
	return &Bindings{engine: e, values: values}, nil
}

func (e *Engine) evaluation(ctx context.Context, bindings *Bindings, options EvalOptions) (*eval.Evaluation, *eval.Recorder, error) {
	if e == nil || bindings == nil || bindings.engine != e {
		return nil, nil, diagnostic.New(InvalidBindings, "$", "bindings must be created by this engine")
	}
	if ctx == nil {
		return nil, nil, diagnostic.New(InvalidBindings, "$", "context must not be nil")
	}
	limit := options.MaxCost
	if limit < 0 || limit > e.limits.MaxCost {
		return nil, nil, diagnostic.New(LimitExceeded, "$.options.maxCost", "cost override must be within engine limit")
	}
	if limit == 0 {
		limit = e.limits.MaxCost
	}
	return eval.NewEvaluation(ctx, bindings.values, limit), eval.NewRecorder(options.Trace, e.limits.MaxTraceEntries), nil
}

func (p *Program) Evaluate(ctx context.Context, bindings *Bindings, options EvalOptions) (Result, error) {
	if p == nil || p.program == nil {
		return Result{}, diagnostic.New(InvalidNode, "$", "program is not initialized")
	}
	e, recorder, err := p.engine.evaluation(ctx, bindings, options)
	if err != nil {
		return Result{}, err
	}
	matched, err := p.program.Run(e, recorder)
	return Result{Matched: matched, Cost: e.Cost(), Trace: recorder.Entries, TraceTruncated: recorder.Truncated}, err
}

func (p *DecisionProgram) Evaluate(ctx context.Context, bindings *Bindings, options EvalOptions) (DecisionResult, error) {
	if p == nil || p.program == nil {
		return DecisionResult{}, diagnostic.New(InvalidNode, "$", "program is not initialized")
	}
	e, recorder, err := p.engine.evaluation(ctx, bindings, options)
	if err != nil {
		return DecisionResult{}, err
	}
	result, err := p.program.Run(e, recorder)
	result.Cost = e.Cost()
	result.Trace = recorder.Entries
	result.TraceTruncated = recorder.Truncated
	return result, err
}
