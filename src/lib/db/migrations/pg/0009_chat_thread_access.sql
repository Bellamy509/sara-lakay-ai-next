CREATE TABLE IF NOT EXISTS "chat_thread_access" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "thread_id" uuid NOT NULL REFERENCES "chat_thread" ("id") ON DELETE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "access_type" text NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "created_by" uuid NOT NULL REFERENCES "user" ("id"),
    CONSTRAINT "chat_thread_access_thread_id_user_id_unique" UNIQUE ("thread_id", "user_id")
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS "chat_thread_access_thread_id_idx" ON "chat_thread_access" ("thread_id");
CREATE INDEX IF NOT EXISTS "chat_thread_access_user_id_idx" ON "chat_thread_access" ("user_id"); 