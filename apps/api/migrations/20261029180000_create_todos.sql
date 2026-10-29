-- +goose Up
CREATE TABLE omw_todo_list (
 id BIGINT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 name VARCHAR(100) NOT NULL,
 legacy_id TEXT,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_todo_list_user ON omw_todo_list (user_id, created_at, id);
CREATE INDEX idx_todo_list_legacy ON omw_todo_list (user_id, legacy_id);
CREATE TABLE omw_todo (
 id BIGINT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 list_id BIGINT,
 title VARCHAR(200) NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 done BOOLEAN NOT NULL DEFAULT FALSE,
 priority SMALLINT NOT NULL DEFAULT 4,
 due_date DATE,
 planned_for DATE,
 completed_at TIMESTAMPTZ,
 tags JSONB NOT NULL DEFAULT '[]'::jsonb,
 source_kind VARCHAR(16),
 source_ref TEXT,
 source_label VARCHAR(200),
 version INTEGER NOT NULL DEFAULT 1,
 legacy_id TEXT,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_todo_user_list ON omw_todo (user_id, list_id);
CREATE INDEX idx_todo_source ON omw_todo (user_id, source_kind, source_ref);
CREATE INDEX idx_todo_legacy ON omw_todo (user_id, legacy_id);
CREATE TABLE omw_todo_step (
 id BIGINT PRIMARY KEY,
 user_id BIGINT NOT NULL,
 todo_id BIGINT NOT NULL,
 title VARCHAR(200) NOT NULL,
 done BOOLEAN NOT NULL DEFAULT FALSE,
 position INTEGER NOT NULL,
 created_at TIMESTAMPTZ NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_todo_step_parent ON omw_todo_step (user_id, todo_id, position, id);
