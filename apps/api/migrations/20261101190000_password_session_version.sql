-- +goose Up
ALTER TABLE omw_user ADD COLUMN session_version BIGINT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE omw_user DROP COLUMN session_version;
