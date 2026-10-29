package syntax

import "encoding/json"

type Document struct {
	SchemaVersion int             `json:"schemaVersion"`
	Root          json.RawMessage `json:"root"`
}

type Node struct {
	Kind     string            `json:"kind"`
	Value    json.RawMessage   `json:"value"`
	Children []json.RawMessage `json:"children"`
	Child    json.RawMessage   `json:"child"`
	Op       string            `json:"op"`
	Args     []json.RawMessage `json:"args"`
}

type Operand struct {
	Kind  string          `json:"kind"`
	Path  string          `json:"path"`
	Type  string          `json:"type"`
	Value json.RawMessage `json:"value"`
}

type Rule struct {
	Name      string          `json:"name"`
	Condition json.RawMessage `json:"condition"`
	Output    json.RawMessage `json:"output"`
}

type RuleSet struct {
	SchemaVersion int    `json:"schemaVersion"`
	HitPolicy     string `json:"hitPolicy"`
	Rules         []Rule `json:"rules"`
}
