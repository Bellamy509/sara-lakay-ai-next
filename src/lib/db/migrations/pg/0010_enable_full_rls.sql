-- Enable RLS on all important tables
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY user_self_policy ON "user"
    FOR ALL
    TO public
    USING (id = current_user_id());

-- Session policies
CREATE POLICY session_user_policy ON "session"
    FOR ALL
    TO public
    USING (user_id = current_user_id());

-- Account policies
CREATE POLICY account_user_policy ON "account"
    FOR ALL
    TO public
    USING (user_id = current_user_id());

-- Project policies
CREATE POLICY project_user_policy ON "project"
    FOR ALL
    TO public
    USING (user_id = current_user_id());

-- Ensure current_user_id function exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'current_user_id') THEN
        CREATE FUNCTION current_user_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
            SELECT CAST(current_setting('app.current_user_id', TRUE) AS uuid);
        $$;
    END IF;
END
$$; 