package operator

import (
	"fmt"
	"strings"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

func contains() Operator {
	return Operator{Name: "contains", Compile: func(args []eval.Argument) (eval.Predicate, error) {
		if err := arity(args, 2); err != nil {
			return nil, err
		}
		a, b := args[0], args[1]
		if a.Type() != value.String || b.Type() != value.String {
			return nil, fmt.Errorf("contains requires two strings")
		}
		return func(e *eval.Evaluation) (bool, error) {
			left, err := read(a, e)
			if err != nil {
				return false, err
			}
			right, err := read(b, e)
			if err != nil {
				return false, err
			}
			if left.Type() == value.Null || right.Type() == value.Null {
				return false, nil
			}
			return strings.Contains(left.Text(), right.Text()), nil
		}, nil
	}}
}

func unary(name string) Operator {
	return Operator{Name: name, Compile: func(args []eval.Argument) (eval.Predicate, error) {
		if err := arity(args, 1); err != nil {
			return nil, err
		}
		a := args[0]
		if name == "is_empty" && a.Type() != value.String && !a.Type().IsArray() {
			return nil, fmt.Errorf("is_empty requires a string or array")
		}
		return func(e *eval.Evaluation) (bool, error) {
			if name == "exists" {
				return a.Optional(e).Type() != value.Missing, nil
			}
			v, err := read(a, e)
			if err != nil {
				return false, err
			}
			if name == "is_null" {
				return v.Type() == value.Null, nil
			}
			return v.Type() != value.Null && v.Len() == 0, nil
		}, nil
	}}
}
