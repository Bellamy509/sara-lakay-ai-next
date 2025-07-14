-- Enable RLS on chat_thread table
ALTER TABLE "chat_thread" ENABLE ROW LEVEL SECURITY;

-- Create policy to restrict access to own threads only
CREATE POLICY chat_thread_user_policy ON "chat_thread"
    FOR ALL
    TO public
    USING (user_id = current_user_id());

-- Enable RLS on chat_message table
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;

-- Create policy to restrict access to messages in own threads only
CREATE POLICY chat_message_thread_policy ON "chat_message"
    FOR ALL
    TO public
    USING (thread_id IN (
        SELECT id FROM chat_thread WHERE user_id = current_user_id()
    ));

-- Create function to get current user ID
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT CAST(current_setting('app.current_user_id', TRUE) AS uuid);
$$; 