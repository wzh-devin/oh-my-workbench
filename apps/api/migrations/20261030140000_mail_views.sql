-- +goose Up
-- 归档仅影响工作台视图；正文按需缓存，列表索引不携带正文。
ALTER TABLE omw_mail_message ADD COLUMN is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE omw_mail_message ADD COLUMN body_html text;
ALTER TABLE omw_mail_message ADD COLUMN body_format_version integer NOT NULL DEFAULT 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX omw_mail_message_view_time ON omw_mail_message(user_id, is_archived, received_at DESC, id DESC);
CREATE INDEX omw_mail_message_account_view_time ON omw_mail_message(user_id, account_id, is_archived, received_at DESC, id DESC);
CREATE INDEX omw_mail_message_sender_search ON omw_mail_message USING gin(sender public.gin_trgm_ops);
CREATE INDEX omw_mail_message_address_search ON omw_mail_message USING gin(address public.gin_trgm_ops);
CREATE INDEX omw_mail_message_subject_search ON omw_mail_message USING gin(subject public.gin_trgm_ops);
