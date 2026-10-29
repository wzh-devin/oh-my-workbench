-- +goose Up
CREATE TABLE omw_todo_view (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    builtin_key VARCHAR(16),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(64) NOT NULL,
    filter_query JSONB NOT NULL,
    search_text VARCHAR(200) NOT NULL DEFAULT '',
    sort VARCHAR(16) NOT NULL DEFAULT 'due',
    version INTEGER NOT NULL DEFAULT 1,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX omw_todo_view_user_idx ON omw_todo_view (user_id, deleted_at, created_at, id);

CREATE TABLE omw_todo_priority (
    id BIGINT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    value SMALLINT NOT NULL,
    name VARCHAR(24) NOT NULL,
    color VARCHAR(24) NOT NULL,
    position INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX omw_todo_priority_user_idx ON omw_todo_priority (user_id, position, id);

-- +goose Down
DROP TABLE omw_todo_priority;
DROP TABLE omw_todo_view;
