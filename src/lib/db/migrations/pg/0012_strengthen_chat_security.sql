-- Strengthen RLS policies for chat messages
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "encrypted_chat_message" ENABLE ROW LEVEL SECURITY;

-- Update chat message access policy to be more restrictive
DROP POLICY IF EXISTS chat_message_access_policy ON "chat_message";
CREATE POLICY chat_message_access_policy ON "chat_message"
    FOR ALL
    TO public
    USING (
        thread_id IN (
            SELECT ct.id 
            FROM chat_thread ct
            LEFT JOIN chat_thread_access cta ON ct.id = cta.thread_id
            WHERE ct.user_id = current_user_id()
            OR (cta.user_id = current_user_id() AND cta.access_type IN ('viewer', 'editor'))
        )
    );

-- Update encrypted message access policy
DROP POLICY IF EXISTS encrypted_chat_message_access_policy ON "encrypted_chat_message";
CREATE POLICY encrypted_chat_message_access_policy ON "encrypted_chat_message"
    FOR ALL
    TO public
    USING (
        thread_id IN (
            SELECT ct.id 
            FROM chat_thread ct
            LEFT JOIN chat_thread_access cta ON ct.id = cta.thread_id
            WHERE ct.user_id = current_user_id()
            OR (cta.user_id = current_user_id() AND cta.access_type IN ('viewer', 'editor'))
        )
    );

-- Add additional constraints to chat_thread_access
ALTER TABLE "chat_thread_access" ADD CONSTRAINT check_access_type 
    CHECK (access_type IN ('viewer', 'editor'));

-- Prevent users from granting access to threads they don't own
ALTER TABLE "chat_thread_access" ADD CONSTRAINT check_thread_owner
    CHECK (
        created_by IN (
            SELECT user_id 
            FROM chat_thread 
            WHERE id = thread_id
        )
    );

-- Add index for faster access checks
CREATE INDEX IF NOT EXISTS "chat_thread_access_composite_idx" 
    ON "chat_thread_access" (thread_id, user_id, access_type);

-- Update session handling
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_access_policy ON "session"
    FOR ALL
    TO public
    USING (user_id = current_user_id());

-- Ensure proper cascading deletes
ALTER TABLE "chat_message" 
    DROP CONSTRAINT IF EXISTS "chat_message_thread_id_chat_thread_id_fk",
    ADD CONSTRAINT "chat_message_thread_id_chat_thread_id_fk" 
    FOREIGN KEY ("thread_id") 
    REFERENCES "chat_thread" ("id") 
    ON DELETE CASCADE; 