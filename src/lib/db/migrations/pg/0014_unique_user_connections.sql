-- Create user_connection table to track active connections
CREATE TABLE IF NOT EXISTS user_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    connection_token TEXT NOT NULL UNIQUE,
    tool_access_id UUID REFERENCES tool_user_access(id) ON DELETE CASCADE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, tool_access_id)
);

-- Add RLS policies
ALTER TABLE user_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_connection_select ON user_connection
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY user_connection_insert ON user_connection
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY user_connection_update ON user_connection
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY user_connection_delete ON user_connection
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Add indexes for better performance
CREATE INDEX idx_user_connection_user_id ON user_connection(user_id);
CREATE INDEX idx_user_connection_tool_access ON user_connection(tool_access_id);
CREATE INDEX idx_user_connection_last_activity ON user_connection(last_activity);

-- Add function to clean up inactive connections
CREATE OR REPLACE FUNCTION cleanup_inactive_connections()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE user_connection
    SET is_active = false
    WHERE last_activity < NOW() - INTERVAL '24 hours';
END;
$$; 