package operator

import (
	"fmt"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

func comparison(name string) Operator {
	return Operator{Name: name, Compile: func(args []eval.Argument) (eval.Predicate, error) {
		count := 2
		if name == "between" {
			count = 3
		}
		if err := arity(args, count); err != nil {
			return nil, err
		}
		a, b := args[0], args[1]
		if name == "eq" || name == "ne" {
			if a.Type() != b.Type() && a.Type() != value.Null && b.Type() != value.Null {
				return nil, fmt.Errorf("eq/ne require matching types or null")
			}
		} else if !a.Type().Ordered() || a.Type() != b.Type() {
			return nil, fmt.Errorf("ordered comparison requires matching ordered scalar types")
		}
		var upper eval.Argument
		if count == 3 {
			upper = args[2]
			if upper.Type() != a.Type() {
				return nil, fmt.Errorf("between bounds must match the value type")
			}
			lo, lc := b.Constant()
			hi, hc := upper.Constant()
			if lc && hc && value.Compare(lo, hi) > 0 {
				return nil, fmt.Errorf("between lower bound exceeds upper bound")
			}
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
			if name == "eq" {
				return value.Equal(left, right), nil
			}
			if name == "ne" {
				return !value.Equal(left, right), nil
			}
			// Nullable fields never satisfy ordered predicates when their value is null.
			if left.Type() == value.Null || right.Type() == value.Null {
				return false, nil
			}
			comparison := value.Compare(left, right)
			switch name {
			case "gt":
				return comparison > 0, nil
			case "gte":
				return comparison >= 0, nil
			case "lt":
				return comparison < 0, nil
			case "lte":
				return comparison <= 0, nil
			default:
				hi, err := read(upper, e)
				if err != nil {
					return false, err
				}
				if hi.Type() == value.Null {
					return false, nil
				}
				return comparison >= 0 && value.Compare(left, hi) <= 0, nil
			}
		}, nil
	}}
}
