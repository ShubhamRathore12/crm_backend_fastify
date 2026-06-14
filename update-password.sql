-- Update all users with test password hash
-- Password: password123
-- SHA256 Hash: 353c2d5ccaaec48d4436f635e67b785f830c6e11c920903df705fb90880724f8

UPDATE public.users 
SET password_hash = '353c2d5ccaaec48d4436f635e67b785f830c6e11c920903df705fb90880724f8'
WHERE status = 'active';

-- Verify the update
SELECT email, role, password_hash FROM public.users LIMIT 10;
