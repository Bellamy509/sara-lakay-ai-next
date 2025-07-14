-- Create encrypted_chat_message table
CREATE TABLE IF NOT EXISTS "encrypted_chat_message" (
    "id" text PRIMARY KEY NOT NULL,
    "thread_id" uuid NOT NULL REFERENCES "chat_thread" ("id") ON DELETE CASCADE,
    "encrypted_content" bytea NOT NULL,
    "iv" bytea NOT NULL,
    "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS "encrypted_chat_message_thread_id_idx" ON "encrypted_chat_message" ("thread_id");

-- Enable RLS on encrypted_chat_message table
ALTER TABLE "encrypted_chat_message" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow access to encrypted messages in own threads and shared threads
CREATE POLICY encrypted_chat_message_access_policy ON "encrypted_chat_message"
    FOR ALL
    TO public
    USING (
        thread_id IN (
            SELECT id 
            FROM chat_thread 
            WHERE user_id = current_user_id()
            UNION
            SELECT thread_id 
            FROM chat_thread_access 
            WHERE user_id = current_user_id()
        )
    );

-- Add encryption key column to user table (will store encrypted per-user key)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "encryption_key" bytea; 