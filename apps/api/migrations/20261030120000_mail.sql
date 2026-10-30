-- +goose Up
-- Mail data belongs to one user; repositories maintain relationships and state.
ALTER TABLE omw_user ADD COLUMN mail_notifications_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE omw_mail_account (
 id bigint PRIMARY KEY, user_id bigint NOT NULL,
 name varchar(100) NOT NULL, provider varchar(16) NOT NULL, email varchar(320) NOT NULL,
 credential_ciphertext bytea NOT NULL, enabled boolean NOT NULL DEFAULT true,
 notify_enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1,
 last_sync_at timestamptz, last_error text,
 lease_token text, lease_until timestamptz,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_account_email ON omw_mail_account(user_id, lower(email));
CREATE INDEX omw_mail_account_enabled ON omw_mail_account(enabled, lease_until);

CREATE TABLE omw_mail_mailbox (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, account_id bigint NOT NULL,
 remote_name varchar(255) NOT NULL DEFAULT 'INBOX', uid_validity bigint NOT NULL,
 notification_boundary bigint NOT NULL, live_uid bigint NOT NULL,
 history_uid bigint NOT NULL DEFAULT 0, history_done boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_mailbox_account ON omw_mail_mailbox(account_id, remote_name);

CREATE TABLE omw_mail_message (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, account_id bigint NOT NULL, mailbox_id bigint NOT NULL,
 uid_validity bigint NOT NULL, remote_uid bigint NOT NULL, rfc_message_id text NOT NULL DEFAULT '',
 sender text NOT NULL, address text NOT NULL, recipients jsonb NOT NULL DEFAULT '{}',
 subject text NOT NULL, preview text NOT NULL DEFAULT '', body_text text, body_fetched_at timestamptz,
 received_at timestamptz NOT NULL, size_bytes bigint NOT NULL,
 is_read boolean NOT NULL DEFAULT false, is_starred boolean NOT NULL DEFAULT false,
 attachment_count integer NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_message_remote ON omw_mail_message(mailbox_id, uid_validity, remote_uid);
CREATE INDEX omw_mail_message_time ON omw_mail_message(user_id, received_at DESC, id DESC);
CREATE INDEX omw_mail_message_account_time ON omw_mail_message(user_id, account_id, received_at DESC, id DESC);
CREATE INDEX omw_mail_message_unread ON omw_mail_message(user_id, received_at DESC) WHERE NOT is_read;

CREATE TABLE omw_mail_attachment (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, message_id bigint NOT NULL,
 part_id varchar(64) NOT NULL, filename text NOT NULL, content_type text NOT NULL,
 encoding varchar(32) NOT NULL, charset varchar(128) NOT NULL DEFAULT '', size_bytes bigint NOT NULL,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_attachment_part ON omw_mail_attachment(message_id, part_id);

CREATE TABLE omw_mail_sync_job (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, account_id bigint NOT NULL,
 trigger varchar(16) NOT NULL, status varchar(16) NOT NULL DEFAULT 'queued',
 processed_count integer NOT NULL DEFAULT 0, started_at timestamptz, finished_at timestamptz,
 last_error text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_sync_job_active ON omw_mail_sync_job(account_id) WHERE status IN ('queued', 'running');
CREATE INDEX omw_mail_sync_job_recent ON omw_mail_sync_job(user_id, account_id, created_at DESC);

CREATE TABLE omw_mail_notification (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, message_id bigint NOT NULL,
 read_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_notification_message ON omw_mail_notification(user_id, message_id);
CREATE INDEX omw_mail_notification_recent ON omw_mail_notification(user_id, created_at DESC, id DESC);

CREATE TABLE omw_push_subscription (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, endpoint text NOT NULL,
 public_key text NOT NULL, auth text NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_push_subscription_endpoint ON omw_push_subscription(endpoint);
CREATE INDEX omw_push_subscription_user ON omw_push_subscription(user_id) WHERE enabled;

CREATE TABLE omw_mail_push_delivery (
 id bigint PRIMARY KEY, user_id bigint NOT NULL, notification_id bigint NOT NULL, subscription_id bigint NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 next_retry_at timestamptz NOT NULL, lease_token text, lease_until timestamptz,
 last_error text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX omw_mail_push_delivery_target ON omw_mail_push_delivery(notification_id, subscription_id);
CREATE INDEX omw_mail_push_delivery_pending ON omw_mail_push_delivery(next_retry_at) WHERE status IN ('queued', 'running');
