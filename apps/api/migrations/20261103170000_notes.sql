-- +goose Up
CREATE TABLE omw_note_notebook (
 id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, name TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX omw_note_notebook_user ON omw_note_notebook(user_id,position,id);
CREATE TABLE omw_note (
 id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, notebook_id BIGINT,
 title TEXT NOT NULL, tags JSONB NOT NULL DEFAULT '[]',
 body_ciphertext BYTEA NOT NULL, key_id TEXT NOT NULL,
 requires_unlock BOOLEAN NOT NULL DEFAULT FALSE, favorite BOOLEAN NOT NULL DEFAULT FALSE,
 diary_date DATE, version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
 create_request_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX omw_note_request ON omw_note(user_id,create_request_id);
CREATE INDEX omw_note_page ON omw_note(user_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX omw_note_notebook_page ON omw_note(user_id,notebook_id,updated_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX omw_note_trash ON omw_note(user_id,deleted_at DESC,id DESC) WHERE deleted_at IS NOT NULL;
CREATE TABLE omw_note_revision (
 id BIGINT PRIMARY KEY, user_id BIGINT NOT NULL, note_id BIGINT NOT NULL, note_version INTEGER NOT NULL,
 body_ciphertext BYTEA NOT NULL, key_id TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX omw_note_revision_version ON omw_note_revision(user_id,note_id,note_version);
CREATE INDEX omw_note_revision_page ON omw_note_revision(user_id,note_id,created_at DESC,id DESC);

-- +goose Down
DROP TABLE omw_note_revision;
DROP TABLE omw_note;
DROP TABLE omw_note_notebook;
