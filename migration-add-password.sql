-- Migration: Add password_hash and team_id columns to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS team_id UUID;

-- Update existing users with test password hash
-- Password: password123 + API_KEY_SALT
-- Hash: e5fa44f2b31c1fb553b6021e7aab6b74476544c534d46542c3a17a34c176c6f6
UPDATE public.users SET password_hash = 'e5fa44f2b31c1fb553b6021e7aab6b74476544c534d46542c3a17a34c176c6f6' 
WHERE password_hash IS NULL AND status = 'active';

-- Display results
SELECT id, email, name, password_hash, status FROM public.users LIMIT 10;
