-- +goose Up
ALTER TABLE omw_asset_connection
    ADD COLUMN public_endpoint TEXT NOT NULL DEFAULT '',
    ADD COLUMN addressing_style TEXT NOT NULL DEFAULT 'path';

-- +goose Down
ALTER TABLE omw_asset_connection
    DROP COLUMN addressing_style,
    DROP COLUMN public_endpoint;
