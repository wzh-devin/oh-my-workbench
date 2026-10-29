-- +goose Up
-- Create "omw_user" table
CREATE TABLE "omw_user" (
  "id" bigint NOT NULL,
  "username" character varying(64) NULL,
  "email" character varying(256) NULL,
  "password" text NULL,
  "display_name" character varying(64) NULL,
  "is_admin" boolean NULL,
  "status" character varying(16) NULL,
  "last_login_at" timestamptz NULL,
  "created_at" timestamptz NULL,
  "updated_at" timestamptz NULL,
  PRIMARY KEY ("id")
);
-- Create index "idx_users_email" to table: "omw_user"
CREATE INDEX "idx_users_email" ON "omw_user" ("email");
-- Create index "idx_users_id" to table: "omw_user"
CREATE INDEX "idx_users_id" ON "omw_user" ("id");
-- Create index "idx_users_username" to table: "omw_user"
CREATE INDEX "idx_users_username" ON "omw_user" ("username");
-- Create "omw_system_initialization" table
CREATE TABLE "omw_system_initialization" (
  "id" bigint NOT NULL,
  "admin_user_id" bigint NULL,
  "created_at" timestamptz NULL,
  "updated_at" timestamptz NULL,
  PRIMARY KEY ("id")
);
-- Create index "idx_omw_system_initialization_id" to table: "omw_system_initialization"
CREATE INDEX "idx_omw_system_initialization_id" ON "omw_system_initialization" ("id");
