package eval

type Options struct {
	Trace   bool  `json:"trace,omitempty"`
	MaxCost int64 `json:"maxCost,omitempty"`
}

type TraceEntry struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type Result struct {
	Matched        bool         `json:"matched"`
	Cost           int64        `json:"cost"`
	Trace          []TraceEntry `json:"trace,omitempty"`
	TraceTruncated bool         `json:"traceTruncated,omitempty"`
}

type Recorder struct {
	enabled   bool
	limit     int
	Entries   []TraceEntry
	Truncated bool
}

func NewRecorder(enabled bool, limit int) *Recorder { return &Recorder{enabled: enabled, limit: limit} }
func (r *Recorder) add(i Instruction, status string, err error) {
	if !r.enabled {
		return
	}
	if len(r.Entries) >= r.limit {
		r.Truncated = true
		return
	}
	entry := TraceEntry{Path: i.Path, Kind: i.Kind, Status: status}
	if err != nil {
		entry.Error = err.Error()
	}
	r.Entries = append(r.Entries, entry)
}
