-- +goose Up
CREATE TABLE omw_network_proxy (
 id bigint PRIMARY KEY,
 user_id bigint NOT NULL,
 service varchar(32) NOT NULL,
 proxy_ciphertext bytea,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_network_proxy_user_service ON omw_network_proxy(user_id, service);

-- +goose Down
DROP TABLE omw_network_proxy;
