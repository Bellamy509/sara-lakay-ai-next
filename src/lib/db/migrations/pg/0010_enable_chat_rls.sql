-- Enable RLS on chat_thread table
ALTER TABLE "chat_thread" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow access to own threads and shared threads
CREATE POLICY chat_thread_access_policy ON "chat_thread"
    FOR ALL
    TO public
    USING (
        user_id = current_user_id() OR 
        id IN (
            SELECT thread_id 
            FROM chat_thread_access 
            WHERE user_id = current_user_id()
        )
    );

-- Enable RLS on chat_message table
ALTER TABLE "chat_message" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow access to messages in own threads and shared threads
CREATE POLICY chat_message_access_policy ON "chat_message"
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

-- Enable RLS on chat_thread_access table
ALTER TABLE "chat_thread_access" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow access to own thread access records
CREATE POLICY chat_thread_access_policy ON "chat_thread_access"
    FOR ALL
    TO public
    USING (
        thread_id IN (
            SELECT id 
            FROM chat_thread 
            WHERE user_id = current_user_id()
        ) OR
        user_id = current_user_id()
    ); 