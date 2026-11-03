package logging

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type SQLTracer struct{}
type queryKey struct{}
type queryTrace struct {
	started time.Time
	sql     string
	params  []any
}

func sqlParams(sql string, params []any) []any {
	// Positional arguments carry no field names; hide secret-bearing tables as a unit.
	sql = strings.ToLower(sql)
	private := false
	for _, table := range []string{"omw_user", "omw_mail_account", "omw_system_setting", "omw_asset_connection", "omw_push_subscription", "omw_note"} {
		if strings.Contains(sql, table) {
			private = true
			break
		}
	}
	limit := min(len(params), 64)
	out := make([]any, 0, limit+1)
	budget := maxBodyBytes
	for _, value := range params[:limit] {
		if private {
			out = append(out, redacted)
			continue
		}
		if _, binary := value.([]byte); binary {
			out = append(out, "[OMITTED: binary parameter]")
			continue
		}
		switch value := value.(type) {
		case nil, bool, int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, time.Time:
			out = append(out, value)
			budget -= 32
			continue
		case string:
			if len(value) <= min(1024, budget) {
				out = append(out, redact(value, 0))
				budget -= len(value)
			} else {
				out = append(out, "[OMITTED: parameter limit]")
			}
			continue
		}
		data, err := json.Marshal(value)
		if err != nil || len(data) > min(1024, budget) {
			out = append(out, "[OMITTED: parameter limit]")
			continue
		}
		budget -= len(data)
		decoded, err := decodeJSON(data)
		if err != nil {
			out = append(out, "[OMITTED: parameter type]")
		} else {
			out = append(out, redact(decoded, 0))
		}
	}
	if len(params) > limit {
		out = append(out, "[OMITTED: remaining parameters]")
	}
	return out
}

func (SQLTracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	trace := queryTrace{started: time.Now(), sql: data.SQL, params: sqlParams(data.SQL, data.Args)}
	return context.WithValue(ctx, queryKey{}, trace)
}

func (SQLTracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	trace, ok := ctx.Value(queryKey{}).(queryTrace)
	if !ok {
		return
	}
	finished := time.Now()
	attrs := []any{"sql", trace.sql, "params", trace.params, "started_at", trace.started, "finished_at", finished,
		"duration_ms", float64(finished.Sub(trace.started)) / float64(time.Millisecond), "rows", data.CommandTag.RowsAffected()}
	if data.Err != nil {
		Error(ctx, "sql", data.Err, attrs...)
		return
	}
	level := slog.LevelInfo
	if finished.Sub(trace.started) >= 200*time.Millisecond {
		level = slog.LevelWarn
	}
	FromContext(ctx).Log(ctx, level, "sql", attrs...)
}
