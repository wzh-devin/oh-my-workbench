-- +goose Up
-- 汇总统计只扫描紧凑索引，避免反复读取包含正文的消息页。
CREATE INDEX omw_mail_message_overview ON omw_mail_message(user_id, mailbox_id, uid_validity)
 INCLUDE (account_id, is_read, is_archived, received_at);
