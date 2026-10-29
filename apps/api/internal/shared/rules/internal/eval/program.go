package eval

import (
	"errors"

	"github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/diagnostic"
)

// Instructions are preorder; End points past a subtree, allowing short-circuit jumps.
type Instruction struct {
	Kind      string
	Path      string
	End       int
	Constant  bool
	Predicate Predicate
}

type Program struct{ instructions []Instruction }

func NewProgram(instructions []Instruction) *Program { return &Program{instructions: instructions} }

func (p *Program) Run(e *Evaluation, recorder *Recorder) (bool, error) { return p.run(0, e, recorder) }
func (p *Program) Skip(recorder *Recorder)                             { p.skip(0, len(p.instructions), recorder) }

func (p *Program) skip(start, end int, recorder *Recorder) {
	if !recorder.enabled {
		return
	}
	for _, instruction := range p.instructions[start:end] {
		recorder.add(instruction, "skipped", nil)
		if recorder.Truncated {
			break
		}
	}
}

func (p *Program) run(index int, e *Evaluation, recorder *Recorder) (matched bool, err error) {
	i := p.instructions[index]
	e.path = i.Path
	if err = e.Charge(1); err == nil {
		switch i.Kind {
		case "constant":
			matched = i.Constant
		case "condition":
			matched, err = i.Predicate(e)
			if err == nil {
				err = e.Charge(0)
			}
			if err != nil {
				var detail *diagnostic.Error
				if !errors.As(err, &detail) {
					err = &diagnostic.Error{Code: diagnostic.OperatorFailed, Path: i.Path, Message: "operator failed", Cause: err}
				}
			}
		case "not":
			matched, err = p.run(index+1, e, recorder)
			matched = !matched
		case "all", "any":
			matched = i.Kind == "all"
			for child := index + 1; child < i.End; child = p.instructions[child].End {
				var result bool
				result, err = p.run(child, e, recorder)
				if err != nil {
					p.skip(p.instructions[child].End, i.End, recorder)
					break
				}
				if (i.Kind == "all" && !result) || (i.Kind == "any" && result) {
					matched = result
					p.skip(p.instructions[child].End, i.End, recorder)
					break
				}
			}
		}
	}
	if err != nil {
		matched = false
		recorder.add(i, "error", err)
	} else if matched {
		recorder.add(i, "matched", nil)
	} else {
		recorder.add(i, "unmatched", nil)
	}
	return matched, err
}
