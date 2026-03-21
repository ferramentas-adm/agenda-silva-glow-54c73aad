
-- Enable leaked password protection via auth config
ALTER ROLE authenticator SET pgrst.db_pre_config = '';
-- This is handled via Supabase Auth config, not SQL migration
SELECT 1;
