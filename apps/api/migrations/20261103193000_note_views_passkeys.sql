-- +goose Up
CREATE TABLE omw_note_view (
    id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES omw_user(id),
    name TEXT NOT NULL, icon TEXT NOT NULL, scope TEXT NOT NULL,
    filter_query JSONB NOT NULL, sort TEXT NOT NULL, builtin_key TEXT,
    version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ,
    UNIQUE (user_id, builtin_key)
);
CREATE INDEX omw_note_view_user ON omw_note_view(user_id, created_at, id) WHERE deleted_at IS NULL;
CREATE TABLE omw_note_passkey (
    user_id BIGINT NOT NULL REFERENCES omw_user(id), rp_id TEXT NOT NULL,
    user_handle BYTEA NOT NULL, credential JSONB, version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, rp_id)
);
-- +goose Down
DROP TABLE omw_note_passkey;
DROP TABLE omw_note_view;
