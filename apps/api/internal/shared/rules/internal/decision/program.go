package decision

import (
	"encoding/json"
	"fmt"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/codec"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/compiler"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/eval"
	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/syntax"
)

type Policy string

const (
	First     Policy = "FIRST"
	RuleOrder Policy = "RULE_ORDER"
	Unique    Policy = "UNIQUE"
)

type rule struct {
	name      string
	condition *eval.Program
	output    json.RawMessage
}
type Program struct {
	policy Policy
	rules  []rule
}
type Match struct {
	Name   string          `json:"name"`
	Output json.RawMessage `json:"output"`
}
type Result struct {
	Matches        []Match           `json:"matches"`
	Cost           int64             `json:"cost"`
	Trace          []eval.TraceEntry `json:"trace,omitempty"`
	TraceTruncated bool              `json:"traceTruncated,omitempty"`
}

func Compile(c *compiler.Compiler, data []byte) (*Program, error) {
	if err := c.ValidateJSON(data); err != nil {
		return nil, err
	}
	if err := codec.Shape(data, "$", []string{"schemaVersion", "hitPolicy", "rules"}); err != nil {
		return nil, err
	}
	var set syntax.RuleSet
	if err := codec.Decode(data, &set, "$"); err != nil {
		return nil, err
	}
	if set.SchemaVersion != 1 {
		return nil, diagnostic.New(diagnostic.UnsupportedVersion, "$.schemaVersion", "expected schema version 1")
	}
	policy := Policy(set.HitPolicy)
	if policy != First && policy != RuleOrder && policy != Unique {
		return nil, diagnostic.New(diagnostic.InvalidNode, "$.hitPolicy", "expected FIRST, RULE_ORDER or UNIQUE")
	}
	if len(set.Rules) == 0 || len(set.Rules) > c.Limits.MaxRules {
		return nil, diagnostic.New(diagnostic.LimitExceeded, "$.rules", "rule set must contain 1..MaxRules rules")
	}
	var raw struct {
		Rules []json.RawMessage `json:"rules"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, diagnostic.New(diagnostic.InvalidJSON, "$", err.Error())
	}
	program := &Program{policy: policy}
	names := map[string]bool{}
	count := 0
	for i, r := range set.Rules {
		path := fmt.Sprintf("$.rules[%d]", i)
		if err := codec.Shape(raw.Rules[i], path, []string{"name", "condition", "output"}); err != nil {
			return nil, err
		}
		if r.Name == "" || names[r.Name] {
			return nil, diagnostic.New(diagnostic.InvalidNode, path+".name", "rule names must be nonempty and unique")
		}
		names[r.Name] = true
		condition, err := c.CompileRoot(r.Condition, path+".condition", &count)
		if err != nil {
			return nil, err
		}
		program.rules = append(program.rules, rule{name: r.Name, condition: condition, output: append(json.RawMessage(nil), r.Output...)})
	}
	return program, nil
}

func (p *Program) Run(e *eval.Evaluation, recorder *eval.Recorder) (Result, error) {
	result := Result{Matches: []Match{}}
	for i, r := range p.rules {
		matched, err := r.condition.Run(e, recorder)
		if err != nil {
			result.Matches = nil
			return result, err
		}
		if !matched {
			continue
		}
		if p.policy == Unique && len(result.Matches) > 0 {
			result.Matches = nil
			return result, diagnostic.New(diagnostic.MultipleMatches, "$.rules", "UNIQUE policy matched more than one rule")
		}
		result.Matches = append(result.Matches, Match{Name: r.name, Output: append(json.RawMessage(nil), r.output...)})
		if p.policy == First {
			for _, remaining := range p.rules[i+1:] {
				remaining.condition.Skip(recorder)
			}
			break
		}
	}
	return result, nil
}
