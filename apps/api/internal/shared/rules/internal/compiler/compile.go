package compiler

import (
	"encoding/json"
	"fmt"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/codec"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/operator"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/syntax"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"
)

type Compiler struct {
	Layout    *Layout
	Operators map[string]operator.Operator
	Limits    diagnostic.Limits
}

func (c *Compiler) ValidateJSON(data []byte) error {
	return codec.Validate(data, c.Limits.MaxRuleBytes, c.Limits.MaxDepth*4+16, max(c.Limits.MaxNodes, c.Limits.MaxArrayLength, c.Limits.MaxRules), c.Limits.MaxStringBytes)
}

func (c *Compiler) Compile(data []byte) (*eval.Program, error) {
	if err := c.ValidateJSON(data); err != nil {
		return nil, err
	}
	if err := codec.Shape(data, "$", []string{"schemaVersion", "root"}); err != nil {
		return nil, err
	}
	var document syntax.Document
	if err := codec.Decode(data, &document, "$"); err != nil {
		return nil, err
	}
	if document.SchemaVersion != 1 {
		return nil, diagnostic.New(diagnostic.UnsupportedVersion, "$.schemaVersion", "expected schema version 1")
	}
	count := 0
	return c.CompileRoot(document.Root, "$.root", &count)
}

func (c *Compiler) CompileRoot(data []byte, path string, count *int) (*eval.Program, error) {
	instructions := []eval.Instruction{}
	if err := c.node(data, path, 1, count, &instructions); err != nil {
		return nil, err
	}
	return eval.NewProgram(instructions), nil
}

func (c *Compiler) node(data []byte, path string, depth int, count *int, output *[]eval.Instruction) error {
	(*count)++
	if depth > c.Limits.MaxDepth || *count > c.Limits.MaxNodes {
		return diagnostic.New(diagnostic.LimitExceeded, path, "rule depth or node limit exceeded")
	}
	var node syntax.Node
	if err := codec.Decode(data, &node, path); err != nil {
		return err
	}
	var required []string
	switch node.Kind {
	case "constant":
		required = []string{"kind", "value"}
	case "all", "any":
		required = []string{"kind", "children"}
	case "not":
		required = []string{"kind", "child"}
	case "condition":
		required = []string{"kind", "op", "args"}
	default:
		return diagnostic.New(diagnostic.InvalidNode, path+".kind", "unknown rule node kind")
	}
	if err := codec.Shape(data, path, required); err != nil {
		return err
	}
	index := len(*output)
	*output = append(*output, eval.Instruction{Kind: node.Kind, Path: path})
	switch node.Kind {
	case "constant":
		var constant *bool
		if err := codec.Decode(node.Value, &constant, path+".value"); err != nil {
			return err
		}
		if constant == nil {
			return diagnostic.New(diagnostic.TypeMismatch, path+".value", "rule constants must be boolean")
		}
		(*output)[index].Constant = *constant
	case "all", "any":
		if len(node.Children) == 0 {
			return diagnostic.New(diagnostic.InvalidNode, path+".children", "groups must contain at least one child")
		}
		for i, child := range node.Children {
			if err := c.node(child, fmt.Sprintf("%s.children[%d]", path, i), depth+1, count, output); err != nil {
				return err
			}
		}
	case "not":
		if err := c.node(node.Child, path+".child", depth+1, count, output); err != nil {
			return err
		}
	case "condition":
		op, exists := c.Operators[node.Op]
		if !exists {
			return diagnostic.New(diagnostic.UnknownOperator, path+".op", "unknown operator: "+node.Op)
		}
		if len(node.Args) > c.Limits.MaxArrayLength {
			return diagnostic.New(diagnostic.LimitExceeded, path+".args", "too many arguments")
		}
		if node.Args == nil {
			return diagnostic.New(diagnostic.InvalidNode, path+".args", "arguments must be an array")
		}
		args := make([]eval.Argument, len(node.Args))
		for i, raw := range node.Args {
			(*count)++
			if *count > c.Limits.MaxNodes {
				return diagnostic.New(diagnostic.LimitExceeded, path, "node limit exceeded")
			}
			arg, err := c.argument(raw, fmt.Sprintf("%s.args[%d]", path, i))
			if err != nil {
				return err
			}
			args[i] = arg
		}
		predicate, err := op.Compile(args)
		if err != nil {
			return &diagnostic.Error{Code: diagnostic.TypeMismatch, Path: path, Message: err.Error(), Cause: err}
		}
		if predicate == nil {
			return diagnostic.New(diagnostic.InvalidNode, path, "operator compiler returned no predicate")
		}
		(*output)[index].Predicate = predicate
	}
	(*output)[index].End = len(*output)
	return nil
}

func (c *Compiler) argument(data []byte, path string) (eval.Argument, error) {
	var arg syntax.Operand
	if err := codec.Decode(data, &arg, path); err != nil {
		return eval.Argument{}, err
	}
	switch arg.Kind {
	case "fact", "context":
		if err := codec.Shape(data, path, []string{"kind", "path"}); err != nil {
			return eval.Argument{}, err
		}
		source := "facts"
		if arg.Kind == "context" {
			source = "context"
		}
		field, exists := c.Layout.ByPath[source+"."+arg.Path]
		if !exists {
			return eval.Argument{}, diagnostic.New(diagnostic.UnknownField, path+".path", "field is not declared in schema: "+arg.Path)
		}
		return eval.Argument{ValueType: field.Definition.Type, Slot: field.Slot, Path: "$." + source + "." + arg.Path}, nil
	case "constant":
		if err := codec.Shape(data, path, []string{"kind", "value"}, "type"); err != nil {
			return eval.Argument{}, err
		}
		var properties map[string]json.RawMessage
		if err := codec.Decode(data, &properties, path); err != nil {
			return eval.Argument{}, err
		}
		expected := value.Type(arg.Type)
		if _, exists := properties["type"]; exists && !expected.Valid() {
			return eval.Argument{}, diagnostic.New(diagnostic.TypeMismatch, path+".type", "unsupported constant type")
		}
		var raw any
		if err := codec.Decode(arg.Value, &raw, path+".value"); err != nil {
			return eval.Argument{}, err
		}
		if raw == nil && expected != "" {
			return eval.Argument{}, diagnostic.New(diagnostic.TypeMismatch, path+".value", "null constants must omit type")
		}
		normalized, err := value.Normalize(raw, expected, c.Limits, path+".value")
		if err != nil {
			return eval.Argument{}, err
		}
		return eval.Argument{ValueType: normalized.Type(), Literal: normalized, IsLiteral: true, Path: path}, nil
	default:
		return eval.Argument{}, diagnostic.New(diagnostic.InvalidNode, path+".kind", "expected fact, context or constant operand")
	}
}
