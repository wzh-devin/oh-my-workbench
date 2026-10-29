package operator

import (
	"fmt"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

type Operator struct {
	Name    string
	Compile func([]eval.Argument) (eval.Predicate, error)
}

func Registry(custom []Operator) (map[string]Operator, error) {
	result := map[string]Operator{}
	operators := []Operator{}
	for _, name := range []string{"eq", "ne", "gt", "gte", "lt", "lte", "between"} {
		operators = append(operators, comparison(name))
	}
	for _, name := range []string{"in", "not_in", "has_any", "has_all"} {
		operators = append(operators, collection(name))
	}
	operators = append(operators, contains())
	for _, name := range []string{"exists", "is_null", "is_empty"} {
		operators = append(operators, unary(name))
	}
	operators = append(operators, custom...)
	for _, op := range operators {
		if op.Name == "" || op.Compile == nil {
			return nil, fmt.Errorf("operator needs a name and compiler")
		}
		if _, exists := result[op.Name]; exists {
			return nil, fmt.Errorf("duplicate operator %q", op.Name)
		}
		result[op.Name] = op
	}
	return result, nil
}

func arity(args []eval.Argument, count int) error {
	if len(args) != count {
		return fmt.Errorf("expected %d arguments, got %d", count, len(args))
	}
	return nil
}

func read(a eval.Argument, e *eval.Evaluation) (value.Value, error) {
	v, err := a.Read(e)
	if err != nil {
		return v, err
	}
	return v, e.Charge(v.Work())
}
