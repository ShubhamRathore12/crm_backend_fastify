-- ============================================================
-- CRM Backend - Seed Data (Dummy Data for Testing)
-- ============================================================

-- Create roles for PostgREST
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ============================================================
-- CONTACTS - 50 dummy contacts
-- ============================================================
INSERT INTO public.contacts (id, email, first_name, last_name, phone, company, tags, custom_fields, status) VALUES
('a1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'Rahul', 'Sharma', '+91-9876543210', 'TechCorp India', ARRAY['enterprise', 'hot-lead'], '{"industry": "IT", "city": "Mumbai", "designation": "CTO"}', 'active'),
('a1000001-0000-0000-0000-000000000002', 'priya.patel@infosys.com', 'Priya', 'Patel', '+91-9876543211', 'Infosys', ARRAY['enterprise', 'existing-client'], '{"industry": "IT", "city": "Bangalore", "designation": "VP Engineering"}', 'active'),
('a1000001-0000-0000-0000-000000000003', 'amit.kumar@wipro.com', 'Amit', 'Kumar', '+91-9876543212', 'Wipro', ARRAY['enterprise'], '{"industry": "IT", "city": "Hyderabad", "designation": "Director"}', 'active'),
('a1000001-0000-0000-0000-000000000004', 'sneha.reddy@tcs.com', 'Sneha', 'Reddy', '+91-9876543213', 'TCS', ARRAY['enterprise', 'warm-lead'], '{"industry": "IT", "city": "Chennai", "designation": "Program Manager"}', 'active'),
('a1000001-0000-0000-0000-000000000005', 'vikram.singh@hcl.com', 'Vikram', 'Singh', '+91-9876543214', 'HCL Technologies', ARRAY['enterprise'], '{"industry": "IT", "city": "Noida", "designation": "SVP"}', 'active'),
('a1000001-0000-0000-0000-000000000006', 'anita.desai@reliance.com', 'Anita', 'Desai', '+91-9876543215', 'Reliance Industries', ARRAY['conglomerate', 'hot-lead'], '{"industry": "Energy", "city": "Mumbai", "designation": "GM Digital"}', 'active'),
('a1000001-0000-0000-0000-000000000007', 'rajesh.gupta@tatamotors.com', 'Rajesh', 'Gupta', '+91-9876543216', 'Tata Motors', ARRAY['automotive', 'existing-client'], '{"industry": "Automotive", "city": "Pune", "designation": "Head of IT"}', 'active'),
('a1000001-0000-0000-0000-000000000008', 'meera.nair@flipkart.com', 'Meera', 'Nair', '+91-9876543217', 'Flipkart', ARRAY['ecommerce', 'warm-lead'], '{"industry": "E-Commerce", "city": "Bangalore", "designation": "Product Lead"}', 'active'),
('a1000001-0000-0000-0000-000000000009', 'suresh.iyer@hdfc.com', 'Suresh', 'Iyer', '+91-9876543218', 'HDFC Bank', ARRAY['banking', 'enterprise'], '{"industry": "Banking", "city": "Mumbai", "designation": "CIO"}', 'active'),
('a1000001-0000-0000-0000-000000000010', 'kavita.joshi@zomato.com', 'Kavita', 'Joshi', '+91-9876543219', 'Zomato', ARRAY['startup', 'hot-lead'], '{"industry": "FoodTech", "city": "Gurugram", "designation": "VP Growth"}', 'active'),
('a1000001-0000-0000-0000-000000000011', 'deepak.verma@ola.com', 'Deepak', 'Verma', '+91-9876543220', 'Ola Cabs', ARRAY['startup', 'warm-lead'], '{"industry": "Transport", "city": "Bangalore", "designation": "Engineering Manager"}', 'active'),
('a1000001-0000-0000-0000-000000000012', 'pooja.mehta@paytm.com', 'Pooja', 'Mehta', '+91-9876543221', 'Paytm', ARRAY['fintech', 'existing-client'], '{"industry": "FinTech", "city": "Noida", "designation": "Head of Partnerships"}', 'active'),
('a1000001-0000-0000-0000-000000000013', 'arjun.kapoor@swiggy.com', 'Arjun', 'Kapoor', '+91-9876543222', 'Swiggy', ARRAY['startup'], '{"industry": "FoodTech", "city": "Bangalore", "designation": "Tech Lead"}', 'active'),
('a1000001-0000-0000-0000-000000000014', 'nisha.agarwal@byju.com', 'Nisha', 'Agarwal', '+91-9876543223', 'BYJU''S', ARRAY['edtech', 'warm-lead'], '{"industry": "EdTech", "city": "Bangalore", "designation": "Director Marketing"}', 'active'),
('a1000001-0000-0000-0000-000000000015', 'sanjay.mishra@icici.com', 'Sanjay', 'Mishra', '+91-9876543224', 'ICICI Bank', ARRAY['banking', 'enterprise'], '{"industry": "Banking", "city": "Mumbai", "designation": "VP Technology"}', 'active'),
('a1000001-0000-0000-0000-000000000016', 'ritu.saxena@amazon.in', 'Ritu', 'Saxena', '+91-9876543225', 'Amazon India', ARRAY['ecommerce', 'enterprise'], '{"industry": "E-Commerce", "city": "Hyderabad", "designation": "Senior Manager"}', 'active'),
('a1000001-0000-0000-0000-000000000017', 'manish.tiwari@mahindra.com', 'Manish', 'Tiwari', '+91-9876543226', 'Mahindra Group', ARRAY['conglomerate'], '{"industry": "Automotive", "city": "Mumbai", "designation": "DGM IT"}', 'active'),
('a1000001-0000-0000-0000-000000000018', 'swati.bhatt@razorpay.com', 'Swati', 'Bhatt', '+91-9876543227', 'Razorpay', ARRAY['fintech', 'hot-lead'], '{"industry": "FinTech", "city": "Bangalore", "designation": "Head of Sales"}', 'active'),
('a1000001-0000-0000-0000-000000000019', 'karan.malhotra@dream11.com', 'Karan', 'Malhotra', '+91-9876543228', 'Dream11', ARRAY['startup', 'gaming'], '{"industry": "Gaming", "city": "Mumbai", "designation": "CTO"}', 'active'),
('a1000001-0000-0000-0000-000000000020', 'divya.pillai@freshworks.com', 'Divya', 'Pillai', '+91-9876543229', 'Freshworks', ARRAY['saas', 'existing-client'], '{"industry": "SaaS", "city": "Chennai", "designation": "VP Product"}', 'active'),
('a1000001-0000-0000-0000-000000000021', 'john.smith@acme.com', 'John', 'Smith', '+1-555-0101', 'Acme Corp', ARRAY['international', 'enterprise'], '{"industry": "Manufacturing", "city": "New York", "designation": "CEO"}', 'active'),
('a1000001-0000-0000-0000-000000000022', 'sarah.johnson@globaltech.com', 'Sarah', 'Johnson', '+1-555-0102', 'GlobalTech', ARRAY['international', 'hot-lead'], '{"industry": "Technology", "city": "San Francisco", "designation": "VP Sales"}', 'active'),
('a1000001-0000-0000-0000-000000000023', 'michael.brown@dataflow.io', 'Michael', 'Brown', '+1-555-0103', 'DataFlow', ARRAY['saas', 'warm-lead'], '{"industry": "Data Analytics", "city": "Austin", "designation": "Founder"}', 'active'),
('a1000001-0000-0000-0000-000000000024', 'emma.wilson@cloudnine.co', 'Emma', 'Wilson', '+44-20-7946-0958', 'CloudNine', ARRAY['international', 'saas'], '{"industry": "Cloud", "city": "London", "designation": "MD"}', 'active'),
('a1000001-0000-0000-0000-000000000025', 'david.lee@nexgen.sg', 'David', 'Lee', '+65-6123-4567', 'NexGen Solutions', ARRAY['international', 'enterprise'], '{"industry": "Consulting", "city": "Singapore", "designation": "Partner"}', 'active'),
('a1000001-0000-0000-0000-000000000026', 'arun.menon@zoho.com', 'Arun', 'Menon', '+91-9876543230', 'Zoho', ARRAY['saas', 'existing-client'], '{"industry": "SaaS", "city": "Chennai", "designation": "Product Manager"}', 'active'),
('a1000001-0000-0000-0000-000000000027', 'neha.sharma@myntra.com', 'Neha', 'Sharma', '+91-9876543231', 'Myntra', ARRAY['ecommerce'], '{"industry": "Fashion", "city": "Bangalore", "designation": "Marketing Head"}', 'active'),
('a1000001-0000-0000-0000-000000000028', 'rohit.das@phonepe.com', 'Rohit', 'Das', '+91-9876543232', 'PhonePe', ARRAY['fintech', 'hot-lead'], '{"industry": "FinTech", "city": "Bangalore", "designation": "VP Engineering"}', 'active'),
('a1000001-0000-0000-0000-000000000029', 'anjali.rao@infosys.com', 'Anjali', 'Rao', '+91-9876543233', 'Infosys BPM', ARRAY['enterprise', 'bpo'], '{"industry": "BPO", "city": "Bangalore", "designation": "AVP"}', 'active'),
('a1000001-0000-0000-0000-000000000030', 'vivek.pandey@cred.club', 'Vivek', 'Pandey', '+91-9876543234', 'CRED', ARRAY['fintech', 'startup'], '{"industry": "FinTech", "city": "Bangalore", "designation": "Growth Lead"}', 'active'),
('a1000001-0000-0000-0000-000000000031', 'test.bounced@invalid.com', 'Test', 'Bounced', '+91-0000000001', 'Test Co', ARRAY['test'], '{}', 'bounced'),
('a1000001-0000-0000-0000-000000000032', 'test.unsubscribed@example.com', 'Test', 'Unsubscribed', '+91-0000000002', 'Test Co', ARRAY['test'], '{}', 'unsubscribed'),
('a1000001-0000-0000-0000-000000000033', 'inactive.user@oldcompany.com', 'Inactive', 'User', '+91-0000000003', 'Old Company', ARRAY['test'], '{}', 'inactive');

-- ============================================================
-- TEMPLATES - Email templates
-- ============================================================
INSERT INTO public.templates (id, name, subject, html_body, text_body, variables) VALUES
('b2000001-0000-0000-0000-000000000001', 'Welcome Email', 'Welcome to {{company}}, {{first_name}}!',
'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h1 style="color:#2563eb">Hello, {{first_name}}!</h1>
<p>Welcome to <strong>{{company}}</strong>. We are thrilled to have you on board.</p>
<p>Here are some quick links to get started:</p>
<ul><li>Dashboard: <a href="{{dashboard_url}}">Click here</a></li><li>Documentation: <a href="{{docs_url}}">Read docs</a></li></ul>
<p style="color:#666;font-size:14px">Best regards,<br>The {{company}} Team</p>
</body></html>',
'Hello, {{first_name}}! Welcome to {{company}}. We are thrilled to have you on board.',
ARRAY['first_name', 'company', 'dashboard_url', 'docs_url']),

('b2000001-0000-0000-0000-000000000002', 'Product Launch Announcement', '🚀 Introducing {{product_name}} - {{tagline}}',
'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h1 style="color:#7c3aed">🚀 {{product_name}} is Here!</h1>
<p>Hi {{first_name}},</p>
<p>We are excited to announce <strong>{{product_name}}</strong> — {{tagline}}.</p>
<p>Key features:</p>
<ul><li>{{feature_1}}</li><li>{{feature_2}}</li><li>{{feature_3}}</li></ul>
<a href="{{cta_url}}" style="display:inline-block;background:#7c3aed;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Try it Now</a>
<p style="margin-top:20px;color:#666;font-size:14px">— The {{company}} Team</p>
</body></html>',
'Hi {{first_name}}, We are excited to announce {{product_name}} — {{tagline}}.',
ARRAY['first_name', 'product_name', 'tagline', 'feature_1', 'feature_2', 'feature_3', 'cta_url', 'company']),

('b2000001-0000-0000-0000-000000000003', 'Monthly Newsletter', '📰 {{company}} Monthly Update - {{month}} {{year}}',
'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h1 style="color:#059669">📰 Monthly Update</h1>
<p>Hi {{first_name}},</p>
<p>Here is what happened at {{company}} this month:</p>
<h3>Highlights</h3>
<p>{{highlights}}</p>
<h3>Upcoming Events</h3>
<p>{{events}}</p>
<p style="color:#666;font-size:14px">Stay tuned for more updates!</p>
</body></html>',
'Hi {{first_name}}, Here is your monthly update from {{company}}.',
ARRAY['first_name', 'company', 'month', 'year', 'highlights', 'events']),

('b2000001-0000-0000-0000-000000000004', 'Follow-up After Demo', 'Great connecting with you, {{first_name}}!',
'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<p>Hi {{first_name}},</p>
<p>Thank you for taking the time to see our demo today. I hope it gave you a clear picture of how we can help {{their_company}}.</p>
<p>As discussed, here are the next steps:</p>
<ol><li>{{next_step_1}}</li><li>{{next_step_2}}</li><li>{{next_step_3}}</li></ol>
<p>Feel free to reply to this email if you have any questions.</p>
<p>Best,<br>{{sender_name}}<br>{{sender_title}}</p>
</body></html>',
'Hi {{first_name}}, Thank you for the demo today. Here are the next steps we discussed.',
ARRAY['first_name', 'their_company', 'next_step_1', 'next_step_2', 'next_step_3', 'sender_name', 'sender_title']),

('b2000001-0000-0000-0000-000000000005', 'Abandoned Cart Reminder', 'You left something behind, {{first_name}}! 🛒',
'<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
<h2 style="color:#dc2626">Don''t forget your items!</h2>
<p>Hi {{first_name}},</p>
<p>You have items waiting in your cart. Complete your purchase before they sell out!</p>
<a href="{{cart_url}}" style="display:inline-block;background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none">Complete Purchase</a>
<p style="margin-top:20px;color:#666;font-size:12px">If you have questions, reply to this email.</p>
</body></html>',
'Hi {{first_name}}, You have items in your cart. Complete your purchase: {{cart_url}}',
ARRAY['first_name', 'cart_url']);

-- ============================================================
-- CAMPAIGNS - Sample campaigns
-- ============================================================
INSERT INTO public.campaigns (id, name, subject, template_id, status, segment_query, sent_count, queued_count, metadata) VALUES
('c3000001-0000-0000-0000-000000000001', 'Q1 2025 Product Launch', '🚀 Introducing CRM Pro - Your Sales Superpower',
 'b2000001-0000-0000-0000-000000000002', 'completed',
 '{"tags": ["enterprise", "hot-lead"]}',
 1250, 0, '{"batch_size": 500, "provider_rotation": true}'),

('c3000001-0000-0000-0000-000000000002', 'Welcome Series - New Signups', 'Welcome to Our Platform!',
 'b2000001-0000-0000-0000-000000000001', 'completed',
 '{"status": "active", "tags": ["new-signup"]}',
 3400, 0, '{"type": "automated", "trigger": "signup"}'),

('c3000001-0000-0000-0000-000000000003', 'May 2025 Newsletter', '📰 Monthly Update - May 2025',
 'b2000001-0000-0000-0000-000000000003', 'draft',
 '{"status": "active"}',
 0, 0, '{"scheduled": true}'),

('c3000001-0000-0000-0000-000000000004', 'Enterprise Demo Follow-up', 'Great connecting with you!',
 'b2000001-0000-0000-0000-000000000004', 'running',
 '{"tags": ["enterprise", "demo-attended"]}',
 45, 120, '{"personalized": true}'),

('c3000001-0000-0000-0000-000000000005', 'Re-engagement Campaign', 'We miss you! Come back for 20% off',
 'b2000001-0000-0000-0000-000000000005', 'scheduled',
 '{"status": "inactive"}',
 0, 500, '{"discount_code": "COMEBACK20"}');

-- ============================================================
-- EMAIL LOGS - Sample send records
-- ============================================================
INSERT INTO public.email_logs (campaign_id, contact_id, email, provider, message_id, status, sent_at) VALUES
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'ses', 'msg-001-ses', 'delivered', NOW() - INTERVAL '30 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000002', 'priya.patel@infosys.com', 'sendgrid', 'msg-002-sg', 'opened', NOW() - INTERVAL '30 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000003', 'amit.kumar@wipro.com', 'ses', 'msg-003-ses', 'clicked', NOW() - INTERVAL '29 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000004', 'sneha.reddy@tcs.com', 'mailgun', 'msg-004-mg', 'delivered', NOW() - INTERVAL '30 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000005', 'vikram.singh@hcl.com', 'ses', 'msg-005-ses', 'bounced', NOW() - INTERVAL '30 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000006', 'anita.desai@reliance.com', 'sendgrid', 'msg-006-sg', 'opened', NOW() - INTERVAL '29 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000007', 'rajesh.gupta@tatamotors.com', 'ses', 'msg-007-ses', 'delivered', NOW() - INTERVAL '30 days'),
('c3000001-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000008', 'meera.nair@flipkart.com', 'mailgun', 'msg-008-mg', 'clicked', NOW() - INTERVAL '28 days'),
('c3000001-0000-0000-0000-000000000002', 'a1000001-0000-0000-0000-000000000010', 'kavita.joshi@zomato.com', 'ses', 'msg-009-ses', 'delivered', NOW() - INTERVAL '15 days'),
('c3000001-0000-0000-0000-000000000002', 'a1000001-0000-0000-0000-000000000011', 'deepak.verma@ola.com', 'sendgrid', 'msg-010-sg', 'opened', NOW() - INTERVAL '15 days'),
('c3000001-0000-0000-0000-000000000004', 'a1000001-0000-0000-0000-000000000009', 'suresh.iyer@hdfc.com', 'ses', 'msg-011-ses', 'sent', NOW() - INTERVAL '2 days'),
('c3000001-0000-0000-0000-000000000004', 'a1000001-0000-0000-0000-000000000015', 'sanjay.mishra@icici.com', 'sendgrid', 'msg-012-sg', 'queued', NULL);

-- ============================================================
-- BOUNCES
-- ============================================================
INSERT INTO public.bounces (email, bounce_type, provider, raw_data) VALUES
('test.bounced@invalid.com', 'hard', 'ses', '{"reason": "Mailbox does not exist", "diagnostic": "smtp;550 5.1.1"}'),
('vikram.singh@hcl.com', 'soft', 'ses', '{"reason": "Mailbox full", "diagnostic": "smtp;452 4.2.2"}'),
('old.address@defunct.com', 'hard', 'sendgrid', '{"reason": "Domain not found", "diagnostic": "dns;NXDOMAIN"}');

-- ============================================================
-- UNSUBSCRIBES
-- ============================================================
INSERT INTO public.unsubscribes (email, campaign_id) VALUES
('test.unsubscribed@example.com', 'c3000001-0000-0000-0000-000000000001'),
('inactive.user@oldcompany.com', 'c3000001-0000-0000-0000-000000000002');

-- ============================================================
-- PROVIDER STATS - Last 7 days
-- ============================================================
INSERT INTO public.provider_stats (provider, date, sent_count, bounce_count, complaint_count, delivery_count, open_count, click_count) VALUES
('ses', CURRENT_DATE - 6, 450, 3, 0, 440, 180, 45),
('ses', CURRENT_DATE - 5, 520, 2, 1, 510, 210, 52),
('ses', CURRENT_DATE - 4, 380, 1, 0, 375, 150, 38),
('ses', CURRENT_DATE - 3, 610, 4, 0, 600, 245, 61),
('ses', CURRENT_DATE - 2, 490, 2, 0, 485, 195, 49),
('ses', CURRENT_DATE - 1, 550, 3, 1, 540, 220, 55),
('ses', CURRENT_DATE, 120, 0, 0, 118, 48, 12),
('sendgrid', CURRENT_DATE - 6, 320, 2, 0, 315, 130, 32),
('sendgrid', CURRENT_DATE - 5, 410, 1, 0, 405, 165, 41),
('sendgrid', CURRENT_DATE - 4, 290, 2, 1, 285, 115, 29),
('sendgrid', CURRENT_DATE - 3, 480, 3, 0, 470, 190, 48),
('sendgrid', CURRENT_DATE - 2, 350, 1, 0, 345, 140, 35),
('sendgrid', CURRENT_DATE - 1, 420, 2, 0, 415, 170, 42),
('sendgrid', CURRENT_DATE, 85, 0, 0, 83, 34, 8),
('mailgun', CURRENT_DATE - 6, 180, 1, 0, 177, 72, 18),
('mailgun', CURRENT_DATE - 5, 220, 1, 0, 217, 88, 22),
('mailgun', CURRENT_DATE - 4, 150, 0, 0, 148, 60, 15),
('mailgun', CURRENT_DATE - 3, 270, 2, 0, 265, 108, 27),
('mailgun', CURRENT_DATE - 2, 200, 1, 0, 197, 80, 20),
('mailgun', CURRENT_DATE - 1, 240, 1, 0, 237, 96, 24),
('mailgun', CURRENT_DATE, 55, 0, 0, 54, 22, 5);

-- ============================================================
-- API KEYS - Sample API key (hash of 'crm_test_key_12345')
-- ============================================================
INSERT INTO public.api_keys (account_id, name, key_hash, scopes, active) VALUES
('d4000001-0000-0000-0000-000000000001', 'Development API Key', 'dev_key_hash_placeholder', ARRAY['*'], true),
('d4000001-0000-0000-0000-000000000001', 'Read-Only Key', 'readonly_key_hash_placeholder', ARRAY['contacts:read', 'campaigns:read', 'analytics:read'], true);

-- ============================================================
-- Update campaign completion timestamps
-- ============================================================
UPDATE public.campaigns SET
  started_at = NOW() - INTERVAL '31 days',
  completed_at = NOW() - INTERVAL '30 days'
WHERE id = 'c3000001-0000-0000-0000-000000000001';

UPDATE public.campaigns SET
  started_at = NOW() - INTERVAL '16 days',
  completed_at = NOW() - INTERVAL '15 days'
WHERE id = 'c3000001-0000-0000-0000-000000000002';

UPDATE public.campaigns SET
  started_at = NOW() - INTERVAL '2 days'
WHERE id = 'c3000001-0000-0000-0000-000000000004';

-- Done!
SELECT 'Seed data loaded successfully!' AS status;
