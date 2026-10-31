-- +goose Up
CREATE TABLE omw_asset_connection (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 name varchar(100) NOT NULL, endpoint text NOT NULL, region varchar(64) NOT NULL, bucket varchar(63) NOT NULL,
 prefix text NOT NULL, credential_ciphertext bytea NOT NULL, enabled boolean NOT NULL DEFAULT true,
 last_checked_at timestamptz, last_error text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1
);
CREATE INDEX omw_asset_connection_user ON omw_asset_connection(user_id, id);
CREATE TABLE omw_asset_blob (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 connection_id bigint NOT NULL, sha256 char(64), size_bytes bigint NOT NULL, object_key text NOT NULL,
 object_version_id text NOT NULL DEFAULT '', etag text NOT NULL DEFAULT '', status varchar(16) NOT NULL,
 verified_at timestamptz, next_retry_at timestamptz NOT NULL DEFAULT now(), lease_token varchar(64) NOT NULL DEFAULT '',
 lease_until timestamptz, last_error text NOT NULL DEFAULT ''
);
CREATE INDEX omw_asset_blob_hash ON omw_asset_blob(user_id, connection_id, sha256, size_bytes, status);
CREATE INDEX omw_asset_blob_cleanup ON omw_asset_blob(status, next_retry_at, lease_until);
CREATE TABLE omw_asset_entry (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 connection_id bigint NOT NULL, parent_id bigint, kind varchar(16) NOT NULL, name varchar(200) NOT NULL,
 normalized_name varchar(200) NOT NULL, blob_id bigint, content_type varchar(255) NOT NULL DEFAULT '',
 starred boolean NOT NULL DEFAULT false, last_opened_at timestamptz, trashed_at timestamptz,
 status varchar(16) NOT NULL DEFAULT 'ready', version integer NOT NULL DEFAULT 1, legacy_id varchar(100), legacy_restored_at timestamptz
);
CREATE INDEX omw_asset_entry_directory ON omw_asset_entry(user_id, connection_id, parent_id, normalized_name);
CREATE INDEX omw_asset_entry_time ON omw_asset_entry(user_id, status, updated_at DESC, id DESC);
CREATE INDEX omw_asset_entry_recent ON omw_asset_entry(user_id, created_at DESC, id DESC) WHERE kind='file' AND status='ready';
CREATE INDEX omw_asset_entry_blob ON omw_asset_entry(blob_id);
CREATE INDEX omw_asset_entry_parent ON omw_asset_entry(user_id, parent_id);
CREATE INDEX omw_asset_entry_legacy ON omw_asset_entry(user_id, legacy_id);
CREATE TABLE omw_asset_upload (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 connection_id bigint NOT NULL, blob_id bigint NOT NULL, parent_id bigint, file_name varchar(200) NOT NULL,
 content_type varchar(255) NOT NULL, expected_sha256 char(64) NOT NULL, size_bytes bigint NOT NULL,
 part_size bigint NOT NULL, part_count integer NOT NULL, s3_upload_id text NOT NULL DEFAULT '',
 request_key varchar(64) NOT NULL, status varchar(16) NOT NULL, expires_at timestamptz NOT NULL,
 last_error text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1, entry_id bigint,
 lease_token varchar(64) NOT NULL DEFAULT '', lease_until timestamptz, legacy_id varchar(100)
);
CREATE INDEX omw_asset_upload_request ON omw_asset_upload(user_id, request_key);
CREATE INDEX omw_asset_upload_work ON omw_asset_upload(status, expires_at, lease_until);
CREATE TABLE omw_asset_upload_part (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 upload_id bigint NOT NULL, part_number integer NOT NULL, size_bytes bigint NOT NULL, sha256 char(64) NOT NULL DEFAULT '',
 etag text NOT NULL DEFAULT '', status varchar(16) NOT NULL, lease_token varchar(64) NOT NULL DEFAULT '', lease_until timestamptz
);
CREATE INDEX omw_asset_upload_part_number ON omw_asset_upload_part(user_id, upload_id, part_number);
CREATE TABLE omw_asset_operation (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 connection_id bigint NOT NULL, root_entry_id bigint, kind varchar(16) NOT NULL, status varchar(16) NOT NULL,
 request_key varchar(64) NOT NULL, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
 next_retry_at timestamptz NOT NULL DEFAULT now(), lease_token varchar(64) NOT NULL DEFAULT '', lease_until timestamptz,
 last_error text NOT NULL DEFAULT ''
);
CREATE INDEX omw_asset_operation_request ON omw_asset_operation(user_id, request_key);
CREATE INDEX omw_asset_operation_work ON omw_asset_operation(status, next_retry_at, lease_until);
CREATE TABLE omw_asset_view (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 name varchar(100) NOT NULL, icon varchar(64) NOT NULL, builtin_key varchar(16), filter_query jsonb NOT NULL,
 sort varchar(16) NOT NULL, version integer NOT NULL DEFAULT 1, deleted_at timestamptz
);
CREATE INDEX omw_asset_view_user ON omw_asset_view(user_id, deleted_at, created_at, id);
CREATE TABLE omw_asset_preview (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 blob_id bigint NOT NULL, renderer_version varchar(64) NOT NULL, status varchar(16) NOT NULL, object_key text NOT NULL DEFAULT '',
 object_version_id text NOT NULL DEFAULT '', size_bytes bigint NOT NULL DEFAULT 0, last_error text NOT NULL DEFAULT '',
 attempts integer NOT NULL DEFAULT 0, next_retry_at timestamptz NOT NULL DEFAULT now(), lease_token varchar(64) NOT NULL DEFAULT '', lease_until timestamptz
);
CREATE INDEX omw_asset_preview_blob ON omw_asset_preview(user_id, blob_id, renderer_version);
CREATE INDEX omw_asset_preview_work ON omw_asset_preview(status, next_retry_at, lease_until);
