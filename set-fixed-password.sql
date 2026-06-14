-- Set FIXED admin password that will NOT change on deployment
-- Email: admin@crm.com
-- Password: Admin@123

-- Using SHA256 hash of "Admin@123" + API_KEY_SALT
-- Hash: eba1adbb05e71fe6c444743c98ba611d279760c51cce48564b10fa0d5d3aaf34
UPDATE public.users 
SET password_hash = 'eba1adbb05e71fe6c444743c98ba611d279760c51cce48564b10fa0d5d3aaf34'
WHERE email = 'admin@crm.com';

-- Verify the update
SELECT email, role, password_hash FROM public.users WHERE email = 'admin@crm.com';
