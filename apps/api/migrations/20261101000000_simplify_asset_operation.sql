-- +goose Up
-- 批量操作只保存请求与结果；未使用的调度字段不再占用结构和索引。
DROP INDEX IF EXISTS omw_asset_operation_work;
ALTER TABLE omw_asset_operation
 DROP COLUMN root_entry_id,
 DROP COLUMN attempts,
 DROP COLUMN next_retry_at,
 DROP COLUMN lease_token,
 DROP COLUMN lease_until,
 DROP COLUMN last_error;
CREATE INDEX omw_asset_operation_cleanup
 ON omw_asset_operation(user_id, connection_id) WHERE status = 'cleaning';

-- +goose Down
DROP INDEX IF EXISTS omw_asset_operation_cleanup;
ALTER TABLE omw_asset_operation
 ADD COLUMN root_entry_id bigint,
 ADD COLUMN attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN next_retry_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN lease_token varchar(64) NOT NULL DEFAULT '',
 ADD COLUMN lease_until timestamptz,
 ADD COLUMN last_error text NOT NULL DEFAULT '';
CREATE INDEX omw_asset_operation_work
 ON omw_asset_operation(status, next_retry_at, lease_until);
