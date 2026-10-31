-- +goose Up
-- 已启动的资产库也需要恢复标记；旧迁移执行后不会因源码更新而重跑。
ALTER TABLE omw_asset_entry ADD COLUMN IF NOT EXISTS legacy_restored_at timestamptz;

-- +goose Down
ALTER TABLE omw_asset_entry DROP COLUMN IF EXISTS legacy_restored_at;
