-- +goose Up
ALTER TABLE omw_network_proxy RENAME TO omw_system_setting;
ALTER TABLE omw_system_setting RENAME COLUMN service TO key;
ALTER TABLE omw_system_setting RENAME COLUMN proxy_ciphertext TO value;
ALTER TABLE omw_system_setting ALTER COLUMN key TYPE varchar(128);
UPDATE omw_system_setting SET key = 'network.proxy.' || key;
ALTER INDEX omw_network_proxy_user_service RENAME TO omw_system_setting_user_key;
ALTER TABLE omw_system_setting RENAME CONSTRAINT omw_network_proxy_pkey TO omw_system_setting_pkey;

-- +goose Down
-- Do not discard settings that cannot be represented by the previous proxy-only schema.
-- +goose StatementBegin
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM omw_system_setting WHERE key NOT IN (
  'network.proxy.qq', 'network.proxy.gmail', 'network.proxy.push',
  'network.proxy.storage', 'network.proxy.converter'
 )) THEN
  RAISE EXCEPTION 'system settings contain non-proxy keys; rollback would lose data';
 END IF;
END $$;
-- +goose StatementEnd
UPDATE omw_system_setting SET key = substring(key FROM 15);
ALTER TABLE omw_system_setting ALTER COLUMN key TYPE varchar(32);
ALTER TABLE omw_system_setting RENAME COLUMN key TO service;
ALTER TABLE omw_system_setting RENAME COLUMN value TO proxy_ciphertext;
ALTER INDEX omw_system_setting_user_key RENAME TO omw_network_proxy_user_service;
ALTER TABLE omw_system_setting RENAME CONSTRAINT omw_system_setting_pkey TO omw_network_proxy_pkey;
ALTER TABLE omw_system_setting RENAME TO omw_network_proxy;
