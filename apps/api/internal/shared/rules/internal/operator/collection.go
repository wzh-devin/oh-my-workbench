package operator

import (
	"fmt"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

func collection(name string) Operator {
	return Operator{Name: name, Compile: func(args []eval.Argument) (eval.Predicate, error) {
		if err := arity(args, 2); err != nil {
			return nil, err
		}
		a, b := args[0], args[1]
		membership := name == "in" || name == "not_in"
		if !b.Type().IsArray() || (membership && (a.Type().IsArray() || a.Type() != b.Type().Element())) || (!membership && a.Type() != b.Type()) {
			return nil, fmt.Errorf("collection argument types do not match")
		}
		var fixed map[string]struct{}
		if list, ok := b.Constant(); ok && name != "has_all" {
			fixed = make(map[string]struct{}, list.Len())
			for i := 0; i < list.Len(); i++ {
				fixed[list.At(i).Key()] = struct{}{}
			}
		}
		return func(e *eval.Evaluation) (bool, error) {
			left, err := read(a, e)
			if err != nil {
				return false, err
			}
			right, err := b.Read(e)
			if err != nil {
				return false, err
			}
			if left.Type() == value.Null || right.Type() == value.Null {
				return false, nil
			}
			if name == "has_all" {
				if err := e.Charge(right.Work()); err != nil {
					return false, err
				}
				for i := 0; i < right.Len(); i++ {
					found := false
					for j := 0; j < left.Len(); j++ {
						if err := e.Charge(right.At(i).Work() + left.At(j).Work()); err != nil {
							return false, err
						}
						if value.Equal(right.At(i), left.At(j)) {
							found = true
							break
						}
					}
					if !found {
						return false, nil
					}
				}
				return true, nil
			}
			if fixed == nil {
				if err := e.Charge(right.Work()); err != nil {
					return false, err
				}
			}
			includes := func(item value.Value) (bool, error) {
				if fixed != nil {
					if err := e.Charge(item.Work()); err != nil {
						return false, err
					}
					_, ok := fixed[item.Key()]
					return ok, nil
				}
				for i := 0; i < right.Len(); i++ {
					if err := e.Charge(item.Work() + right.At(i).Work()); err != nil {
						return false, err
					}
					if value.Equal(item, right.At(i)) {
						return true, nil
					}
				}
				return false, nil
			}
			if membership {
				found, err := includes(left)
				if name == "not_in" {
					found = !found
				}
				return found, err
			}
			for i := 0; i < left.Len(); i++ {
				found, err := includes(left.At(i))
				if err != nil {
					return false, err
				}
				if found {
					return true, nil
				}
			}
			return false, nil
		}, nil
	}}
}
