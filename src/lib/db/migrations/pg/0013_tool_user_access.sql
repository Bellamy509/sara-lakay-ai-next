-- Create tool_user_access table
CREATE TABLE IF NOT EXISTS tool_user_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id VARCHAR(255) NOT NULL,
    server_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tool_id, server_id)
);

-- Add RLS policies
ALTER TABLE tool_user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY tool_user_access_select ON tool_user_access
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY tool_user_access_insert ON tool_user_access
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY tool_user_access_update ON tool_user_access
    FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY tool_user_access_delete ON tool_user_access
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- Add updated_at trigger
CREATE TRIGGER set_tool_user_access_updated_at
    BEFORE UPDATE ON tool_user_access
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp(); 