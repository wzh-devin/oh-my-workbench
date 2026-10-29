package syntax

import "github.com/devin/oh-my-workbench/api/internal/shared/rules/internal/value"

type Field struct {
	Type     value.Type `json:"type"`
	Required bool       `json:"required,omitempty"`
	Nullable bool       `json:"nullable,omitempty"`
}

type Schema struct {
	Facts   map[string]Field `json:"facts"`
	Context map[string]Field `json:"context,omitempty"`
}
