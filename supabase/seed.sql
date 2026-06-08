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
-- USERS - Team members
-- ============================================================
INSERT INTO public.users (id, email, name, avatar_url, role, status) VALUES
('u1000001-0000-0000-0000-000000000001', 'jane.smith@company.com', 'Jane Smith', 'https://i.pravatar.cc/150?img=1', 'manager', 'active'),
('u1000001-0000-0000-0000-000000000002', 'mike.johnson@company.com', 'Mike Johnson', 'https://i.pravatar.cc/150?img=2', 'user', 'active'),
('u1000001-0000-0000-0000-000000000003', 'sarah.williams@company.com', 'Sarah Williams', 'https://i.pravatar.cc/150?img=3', 'user', 'active'),
('u1000001-0000-0000-0000-000000000004', 'admin.user@company.com', 'Admin User', 'https://i.pravatar.cc/150?img=4', 'admin', 'active'),
('u1000001-0000-0000-0000-000000000005', 'david.brown@company.com', 'David Brown', 'https://i.pravatar.cc/150?img=5', 'user', 'active');

-- ============================================================
-- LEADS - Sample leads with full details
-- ============================================================
INSERT INTO public.leads (id, name, email, phone, company, source, stage, status, lead_score, description, linkedin_url, website, industry, employee_count, assigned_to, created_at, updated_at) VALUES

-- Lead 1: Hot prospect - ready for demo
('l1000001-0000-0000-0000-000000000001', 'Rahul Sharma', 'rahul.sharma@techcorp.in', '+91-9876543210', 'TechCorp India', 'campaign', 'proposal', 'qualified', 92.5,
'VP of Sales at TechCorp India. Very interested in our enterprise solution. Met at tech conference.', 'https://linkedin.com/in/rahul-sharma-123', 'https://techcorp.in', 'Technology', '5000+',
'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),

-- Lead 2: Warm lead - in discovery phase
('l1000001-0000-0000-0000-000000000002', 'Priya Patel', 'priya.patel@infosys.com', '+91-9876543211', 'Infosys', 'referral', 'discovery', 'contacted', 76.3,
'Engineering manager at Infosys. Referred by existing customer. Has budget available.', 'https://linkedin.com/in/priya-patel-456', 'https://infosys.com', 'IT Services', '2000+',
'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '30 days', NOW() - INTERVAL '5 days'),

-- Lead 3: High-value opportunity
('l1000001-0000-0000-0000-000000000003', 'Amit Kumar', 'amit.kumar@wipro.com', '+91-9876543212', 'Wipro', 'import', 'negotiation', 'qualified', 88.7,
'Director of Technology at Wipro. Looking for enterprise CRM solution for 500+ users. Large deal potential.', 'https://linkedin.com/in/amit-kumar-789', 'https://wipro.com', 'IT Services', '10000+',
'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day'),

-- Lead 4: New lead - just joined
('l1000001-0000-0000-0000-000000000004', 'Sneha Reddy', 'sneha.reddy@tcs.com', '+91-9876543213', 'TCS', 'form', 'new', 'new', 45.2,
'Program manager at TCS. Downloaded pricing guide. No prior contact.', 'https://linkedin.com/in/sneha-reddy-012', 'https://tcs.com', 'IT Services', '5000+',
'u1000001-0000-0000-0000-000000000003', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

-- Lead 5: Cold lead - low score
('l1000001-0000-0000-0000-000000000005', 'Vikram Singh', 'vikram.singh@hcl.com', '+91-9876543214', 'HCL Technologies', 'manual', 'new', 'cold', 32.1,
'SVP at HCL. Not actively looking. Sent generic email. Low engagement.', 'https://linkedin.com/in/vikram-singh-345', 'https://hcl.com', 'IT Services', '5000+',
'u1000001-0000-0000-0000-000000000005', NOW() - INTERVAL '90 days', NOW() - INTERVAL '45 days'),

-- Lead 6: Just converted from opportunity
('l1000001-0000-0000-0000-000000000006', 'Anita Desai', 'anita.desai@reliance.com', '+91-9876543215', 'Reliance Industries', 'campaign', 'closed', 'converted', 95.8,
'GM Digital at Reliance. Just signed contract for implementation. Excellent client profile.', 'https://linkedin.com/in/anita-desai-678', 'https://reliance.com', 'Energy', '10000+',
'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '120 days', NOW() - INTERVAL '1 day'),

-- Lead 7: Lost opportunity
('l1000001-0000-0000-0000-000000000007', 'Rajesh Gupta', 'rajesh.gupta@tatamotors.com', '+91-9876543216', 'Tata Motors', 'api', 'closed', 'lost', 58.4,
'Head of IT at Tata Motors. Chose competitor solution. Budget constraints mentioned.', 'https://linkedin.com/in/rajesh-gupta-901', 'https://tatamotors.com', 'Automotive', '5000+',
'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '75 days', NOW() - INTERVAL '10 days'),

-- Lead 8: Unqualified lead
('l1000001-0000-0000-0000-000000000008', 'Meera Nair', 'meera.nair@flipkart.com', '+91-9876543217', 'Flipkart', 'form', 'discovery', 'unqualified', 38.9,
'Product lead at Flipkart. Wrong department - needs to be forwarded to procurement. Not a fit for our solution.', 'https://linkedin.com/in/meera-nair-234', 'https://flipkart.com', 'E-Commerce', '1000+',
NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '5 days'),

-- Lead 9: International prospect
('l1000001-0000-0000-0000-000000000009', 'John Smith', 'john.smith@acmecorp.com', '+1-555-0101', 'Acme Corporation', 'campaign', 'proposal', 'qualified', 81.5,
'CEO at Acme Corp USA. Met at SaaS conference. Interested in pilot program. 30-day trial arranged.', 'https://linkedin.com/in/john-smith-567', 'https://acmecorp.com', 'Manufacturing', '500-1000',
'u1000001-0000-0000-0000-000000000004', NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days'),

-- Lead 10: High-touch account
('l1000001-0000-0000-0000-000000000010', 'Sarah Johnson', 'sarah.johnson@globaltech.com', '+1-555-0102', 'GlobalTech Solutions', 'referral', 'negotiation', 'qualified', 89.3,
'VP Sales at GlobalTech. Referred by partner. Complex deal with multiple stakeholders. Legal review in progress.', 'https://linkedin.com/in/sarah-johnson-890', 'https://globaltech.com', 'Technology', '100-500',
'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '55 days', NOW() - INTERVAL '2 days');

-- ============================================================
-- LEAD SCORES - Historical scoring data
-- ============================================================
INSERT INTO public.lead_scores (id, lead_id, score, confidence, factors, prediction, created_at) VALUES

('s1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 92.5, 0.95, 
'{"engagement": 0.95, "firmographic": 0.90, "intent": 0.98, "budget": 0.88}', 'likely', NOW() - INTERVAL '2 days'),
('s1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 85.3, 0.87, 
'{"engagement": 0.85, "firmographic": 0.88, "intent": 0.90, "budget": 0.78}', 'likely', NOW() - INTERVAL '10 days'),

('s1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000002', 76.3, 0.82,
'{"engagement": 0.75, "firmographic": 0.85, "intent": 0.72, "budget": 0.75}', 'likely', NOW() - INTERVAL '5 days'),
('s1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000002', 68.1, 0.78,
'{"engagement": 0.65, "firmographic": 0.80, "intent": 0.60, "budget": 0.68}', 'maybe', NOW() - INTERVAL '15 days'),

('s1000001-0000-0000-0000-000000000003', 'l1000001-0000-0000-0000-000000000003', 88.7, 0.91,
'{"engagement": 0.92, "firmographic": 0.92, "intent": 0.88, "budget": 0.85}', 'likely', NOW() - INTERVAL '1 day'),

('s1000001-0000-0000-0000-000000000006', 'l1000001-0000-0000-0000-000000000006', 95.8, 0.98,
'{"engagement": 0.98, "firmographic": 0.95, "intent": 0.98, "budget": 0.98}', 'likely', NOW() - INTERVAL '1 day');

-- ============================================================
-- LEAD HISTORY - Track changes
-- ============================================================
INSERT INTO public.lead_history (id, lead_id, action, field_changed, old_value, new_value, reason, notes, timestamp, changed_by) VALUES

('h1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 'created', NULL, NULL, NULL, 'Initial import from campaign', 'Lead from email campaign', NOW() - INTERVAL '45 days', 'u1000001-0000-0000-0000-000000000004'),
('h1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000001', 'status_updated', 'status', 'new', 'contacted', 'Initial outreach completed', 'Sent intro email, received response', NOW() - INTERVAL '40 days', 'u1000001-0000-0000-0000-000000000001'),
('h1000001-0000-0000-0000-000000000003', 'l1000001-0000-0000-0000-000000000001', 'stage_updated', 'stage', 'new', 'discovery', 'Moved to discovery phase', 'Scheduled initial call', NOW() - INTERVAL '35 days', 'u1000001-0000-0000-0000-000000000001'),
('h1000001-0000-0000-0000-000000000004', 'l1000001-0000-0000-0000-000000000001', 'status_updated', 'status', 'contacted', 'qualified', 'Customer showed strong interest', 'Completed discovery call, now moving to proposal', NOW() - INTERVAL '20 days', 'u1000001-0000-0000-0000-000000000001'),
('h1000001-0000-0000-0000-000000000005', 'l1000001-0000-0000-0000-000000000001', 'stage_updated', 'stage', 'discovery', 'proposal', 'Creating customized proposal', 'Based on discovery call findings', NOW() - INTERVAL '18 days', 'u1000001-0000-0000-0000-000000000001'),
('h1000001-0000-0000-0000-000000000006', 'l1000001-0000-0000-0000-000000000001', 'assigned', NULL, NULL, 'u1000001-0000-0000-0000-000000000001', 'Assigned to Jane for management', NULL, NOW() - INTERVAL '45 days', 'u1000001-0000-0000-0000-000000000004'),

('h1000001-0000-0000-0000-000000000007', 'l1000001-0000-0000-0000-000000000002', 'created', NULL, NULL, NULL, 'Referral from existing customer', 'John recommended this contact', NOW() - INTERVAL '30 days', 'u1000001-0000-0000-0000-000000000001'),
('h1000001-0000-0000-0000-000000000008', 'l1000001-0000-0000-0000-000000000002', 'status_updated', 'status', 'new', 'contacted', 'Sent intro email', NULL, NOW() - INTERVAL '28 days', 'u1000001-0000-0000-0000-000000000002'),

('h1000001-0000-0000-0000-000000000009', 'l1000001-0000-0000-0000-000000000006', 'created', NULL, NULL, NULL, 'Campaign signup', NULL, NOW() - INTERVAL '120 days', 'u1000001-0000-0000-0000-000000000004'),
('h1000001-0000-0000-0000-000000000010', 'l1000001-0000-0000-0000-000000000006', 'status_updated', 'status', 'new', 'converted', 'Contract signed', 'Implementation scheduled for next month', NOW() - INTERVAL '1 day', 'u1000001-0000-0000-0000-000000000001'),

('h1000001-0000-0000-0000-000000000011', 'l1000001-0000-0000-0000-000000000007', 'created', NULL, NULL, NULL, 'API import from CRM', NULL, NOW() - INTERVAL '75 days', 'u1000001-0000-0000-0000-000000000004'),
('h1000001-0000-0000-0000-000000000012', 'l1000001-0000-0000-0000-000000000007', 'status_updated', 'status', 'new', 'lost', 'Chose competitor', 'Budget constraints and existing vendor lock-in', NOW() - INTERVAL '10 days', 'u1000001-0000-0000-0000-000000000002');

-- ============================================================
-- LEAD NOTES - Add team notes
-- ============================================================
INSERT INTO public.lead_notes (id, lead_id, content, type, created_by, created_at) VALUES

('n1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 'Rahul mentioned they have 50 potential users. Very engaged during the call. Asked about API capabilities.', 'general', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '18 days'),
('n1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000001', 'IMPORTANT: CFO needs to approve any contract above $100k. Rahul will set up meeting.', 'internal', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '16 days'),
('n1000001-0000-0000-0000-000000000003', 'l1000001-0000-0000-0000-000000000001', 'Follow up: Need to send pricing options and SSO documentation by Friday.', 'follow_up', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '12 days'),
('n1000001-0000-0000-0000-000000000004', 'l1000001-0000-0000-0000-000000000001', 'Proposal sent on Tuesday. Waiting for internal review feedback.', 'general', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days'),

('n1000001-0000-0000-0000-000000000005', 'l1000001-0000-0000-0000-000000000002', 'Priya is very interested but needs to get internal approvals. Budget cycle is Q2.', 'general', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '12 days'),
('n1000001-0000-0000-0000-000000000006', 'l1000001-0000-0000-0000-000000000002', 'ACTION: Send case study from similar Infosys implementation', 'follow_up', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '8 days'),

('n1000001-0000-0000-0000-000000000007', 'l1000001-0000-0000-0000-000000000006', 'Deal closed! Implementation team to be assigned next week.', 'general', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '1 day');

-- ============================================================
-- OPPORTUNITIES - Sales deals
-- ============================================================
INSERT INTO public.opportunities (id, lead_id, title, type, status, stage, value, probability, expected_closed_at, assigned_to, created_at, updated_at) VALUES

('o1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 'TechCorp Enterprise License - 100 seats', 'sales', 'open', 'proposal', 150000.00, 75, NOW() + INTERVAL '45 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '20 days', NOW() - INTERVAL '2 days'),
('o1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000001', 'TechCorp Implementation Services', 'sales', 'open', 'proposal', 45000.00, 70, NOW() + INTERVAL '60 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '15 days', NOW() - INTERVAL '2 days'),

('o1000001-0000-0000-0000-000000000003', 'l1000001-0000-0000-0000-000000000002', 'Infosys CRM License - 50 seats', 'sales', 'open', 'discovery', 50000.00, 50, NOW() + INTERVAL '90 days', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '25 days', NOW() - INTERVAL '8 days'),

('o1000001-0000-0000-0000-000000000004', 'l1000001-0000-0000-0000-000000000003', 'Wipro Enterprise Suite - 500 seats', 'sales', 'open', 'negotiation', 500000.00, 85, NOW() + INTERVAL '30 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '50 days', NOW() - INTERVAL '1 day'),
('o1000001-0000-0000-0000-000000000005', 'l1000001-0000-0000-0000-000000000003', 'Wipro Premium Support - Annual', 'sales', 'open', 'negotiation', 75000.00, 80, NOW() + INTERVAL '35 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '48 days', NOW() - INTERVAL '1 day'),

('o1000001-0000-0000-0000-000000000006', 'l1000001-0000-0000-0000-000000000006', 'Reliance Industries - Enterprise Implementation', 'sales', 'won', 'closed', 250000.00, 100, NOW() - INTERVAL '5 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '100 days', NOW() - INTERVAL '1 day'),

('o1000001-0000-0000-0000-000000000007', 'l1000001-0000-0000-0000-000000000009', 'Acme Corp - Pilot Program (30 days)', 'sales', 'open', 'proposal', 25000.00, 70, NOW() + INTERVAL '35 days', 'u1000001-0000-0000-0000-000000000004', NOW() - INTERVAL '35 days', NOW() - INTERVAL '3 days'),

('o1000001-0000-0000-0000-000000000008', 'l1000001-0000-0000-0000-000000000010', 'GlobalTech - Enterprise License + Implementation', 'sales', 'open', 'negotiation', 320000.00, 80, NOW() + INTERVAL '25 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days');

-- ============================================================
-- TASKS - Follow-ups and activities
-- ============================================================
INSERT INTO public.tasks (id, subject, description, entity_type, entity_id, priority, status, due_date, assigned_to, created_at, updated_at) VALUES

('t1000001-0000-0000-0000-000000000001', 'Schedule demo call with Rahul', 'Initial product demo for TechCorp team', 'lead', 'l1000001-0000-0000-0000-000000000001', 'high', 'completed', NOW() - INTERVAL '25 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '30 days', NOW() - INTERVAL '25 days'),
('t1000001-0000-0000-0000-000000000002', 'Send customized proposal', 'Tailor proposal based on their 100-seat requirement', 'lead', 'l1000001-0000-0000-0000-000000000001', 'high', 'completed', NOW() - INTERVAL '15 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '18 days', NOW() - INTERVAL '15 days'),
('t1000001-0000-0000-0000-000000000003', 'Follow up on proposal - check status', 'Contact Rahul about proposal review progress', 'lead', 'l1000001-0000-0000-0000-000000000001', 'high', 'open', NOW() + INTERVAL '3 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
('t1000001-0000-0000-0000-000000000004', 'Prepare CFO presentation slides', 'Create executive summary for CFO approval', 'lead', 'l1000001-0000-0000-0000-000000000001', 'urgent', 'open', NOW() + INTERVAL '7 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),

('t1000001-0000-0000-0000-000000000005', 'Initial call with Priya', 'Discovery call to understand Infosys needs', 'lead', 'l1000001-0000-0000-0000-000000000002', 'high', 'completed', NOW() - INTERVAL '20 days', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '25 days', NOW() - INTERVAL '20 days'),
('t1000001-0000-0000-0000-000000000006', 'Send case study - similar implementation', 'Case study from comparable Infosys project', 'lead', 'l1000001-0000-0000-0000-000000000002', 'normal', 'open', NOW() + INTERVAL '5 days', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),

('t1000001-0000-0000-0000-000000000007', 'Send discovery questionnaire', 'Get detailed requirements for Wipro', 'lead', 'l1000001-0000-0000-0000-000000000003', 'high', 'completed', NOW() - INTERVAL '40 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '45 days', NOW() - INTERVAL '40 days'),
('t1000001-0000-0000-0000-000000000008', 'Executive steering committee meeting', 'Present solution to Wipro executive team', 'lead', 'l1000001-0000-0000-0000-000000000003', 'urgent', 'open', NOW() + INTERVAL '10 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),

('t1000001-0000-0000-0000-000000000009', 'Onboarding kickoff meeting', 'Implementation kickoff with Reliance team', 'lead', 'l1000001-0000-0000-0000-000000000006', 'high', 'open', NOW() + INTERVAL '8 days', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),

('t1000001-0000-0000-0000-000000000010', 'Prepare Acme pilot demo', 'Setup pilot environment for 30-day trial', 'lead', 'l1000001-0000-0000-0000-000000000009', 'high', 'open', NOW() + INTERVAL '5 days', 'u1000001-0000-0000-0000-000000000004', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days');

-- ============================================================
-- EMAIL SENDS - Communication history
-- ============================================================
INSERT INTO public.email_sends (id, campaign_id, entity_type, entity_id, to_email, subject, status, read_at, clicked_at, created_at, updated_at) VALUES

('e1000001-0000-0000-0000-000000000001', 'c3000001-0000-0000-0000-000000000001', 'lead', 'l1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'Introducing CRM Pro - Your Sales Superpower', 'opened', NOW() - INTERVAL '40 days', NOW() - INTERVAL '39 days', NOW() - INTERVAL '42 days', NOW() - INTERVAL '40 days'),
('e1000001-0000-0000-0000-000000000002', NULL, 'lead', 'l1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'Quick follow-up: Let''s schedule your demo', 'opened', NOW() - INTERVAL '32 days', NULL, NOW() - INTERVAL '35 days', NOW() - INTERVAL '32 days'),
('e1000001-0000-0000-0000-000000000003', NULL, 'lead', 'l1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'Your Customized Proposal - TechCorp Enterprise Package', 'opened', NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '10 days'),
('e1000001-0000-0000-0000-000000000004', NULL, 'lead', 'l1000001-0000-0000-0000-000000000001', 'rahul.sharma@techcorp.in', 'Checking in: Proposal review status?', 'sent', NULL, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),

('e1000001-0000-0000-0000-000000000005', 'c3000001-0000-0000-0000-000000000001', 'lead', 'l1000001-0000-0000-0000-000000000002', 'priya.patel@infosys.com', 'Introducing CRM Pro - Your Sales Superpower', 'opened', NOW() - INTERVAL '40 days', NULL, NOW() - INTERVAL '42 days', NOW() - INTERVAL '40 days'),
('e1000001-0000-0000-0000-000000000006', NULL, 'lead', 'l1000001-0000-0000-0000-000000000002', 'priya.patel@infosys.com', 'Let''s connect: Quick intro call?', 'opened', NOW() - INTERVAL '25 days', NULL, NOW() - INTERVAL '28 days', NOW() - INTERVAL '25 days'),

('e1000001-0000-0000-0000-000000000007', 'c3000001-0000-0000-0000-000000000001', 'lead', 'l1000001-0000-0000-0000-000000000003', 'amit.kumar@wipro.com', 'Introducing CRM Pro - Your Sales Superpower', 'opened', NOW() - INTERVAL '42 days', NOW() - INTERVAL '41 days', NOW() - INTERVAL '44 days', NOW() - INTERVAL '42 days'),
('e1000001-0000-0000-0000-000000000008', NULL, 'lead', 'l1000001-0000-0000-0000-000000000003', 'amit.kumar@wipro.com', 'Discovery: Understanding Wipro''s requirements', 'delivered', NULL, NULL, NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days'),

('e1000001-0000-0000-0000-000000000009', 'c3000001-0000-0000-0000-000000000001', 'lead', 'l1000001-0000-0000-0000-000000000006', 'anita.desai@reliance.com', 'Introducing CRM Pro - Your Sales Superpower', 'opened', NOW() - INTERVAL '100 days', NOW() - INTERVAL '99 days', NOW() - INTERVAL '102 days', NOW() - INTERVAL '100 days'),
('e1000001-0000-0000-0000-000000000010', NULL, 'lead', 'l1000001-0000-0000-0000-000000000006', 'anita.desai@reliance.com', 'Contract Signed - Implementation Begins!', 'opened', NOW() - INTERVAL '1 day', NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day');

-- ============================================================
-- INTERACTIONS - Phone calls, meetings, etc
-- ============================================================
INSERT INTO public.interactions (id, lead_id, channel, subject, status, priority, assigned_to, last_activity_at, created_at, updated_at) VALUES

('i1000001-0000-0000-0000-000000000001', 'l1000001-0000-0000-0000-000000000001', 'phone', 'Initial discovery call with Rahul', 'completed', 'high', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '30 days', NOW() - INTERVAL '32 days', NOW() - INTERVAL '30 days'),
('i1000001-0000-0000-0000-000000000002', 'l1000001-0000-0000-0000-000000000001', 'meeting', 'Product demo presentation', 'completed', 'high', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '25 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '25 days'),
('i1000001-0000-0000-0000-000000000003', 'l1000001-0000-0000-0000-000000000001', 'phone', 'Proposal discussion with Rahul', 'completed', 'high', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '12 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '12 days'),
('i1000001-0000-0000-0000-000000000004', 'l1000001-0000-0000-0000-000000000001', 'email', 'Ongoing email discussions', 'open', 'normal', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days'),

('i1000001-0000-0000-0000-000000000005', 'l1000001-0000-0000-0000-000000000002', 'phone', 'Initial call with Priya', 'completed', 'high', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '20 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '20 days'),
('i1000001-0000-0000-0000-000000000006', 'l1000001-0000-0000-0000-000000000002', 'email', 'Email follow-up discussion', 'open', 'normal', 'u1000001-0000-0000-0000-000000000002', NOW() - INTERVAL '8 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

('i1000001-0000-0000-0000-000000000007', 'l1000001-0000-0000-0000-000000000003', 'meeting', 'Executive steering committee meeting', 'open', 'urgent', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '5 days', NOW() - INTERVAL '50 days', NOW() - INTERVAL '5 days'),

('i1000001-0000-0000-0000-000000000008', 'l1000001-0000-0000-0000-000000000006', 'meeting', 'Deal closing celebration', 'completed', 'normal', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '2 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),

('i1000001-0000-0000-0000-000000000009', 'l1000001-0000-0000-0000-000000000009', 'meeting', 'Pilot program kickoff meeting', 'open', 'high', 'u1000001-0000-0000-0000-000000000004', NOW() - INTERVAL '8 days', NOW() - INTERVAL '35 days', NOW() - INTERVAL '8 days'),

('i1000001-0000-0000-0000-000000000010', 'l1000001-0000-0000-0000-000000000010', 'phone', 'Initial discovery with GlobalTech', 'completed', 'high', 'u1000001-0000-0000-0000-000000000001', NOW() - INTERVAL '40 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '40 days');

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

-- ============================================================
-- SEED DATA SUMMARY
-- ============================================================
SELECT 
  'Seed data loaded successfully!' AS status,
  (SELECT COUNT(*) FROM public.users) AS users_count,
  (SELECT COUNT(*) FROM public.leads) AS leads_count,
  (SELECT COUNT(*) FROM public.lead_scores) AS lead_scores_count,
  (SELECT COUNT(*) FROM public.lead_history) AS lead_history_count,
  (SELECT COUNT(*) FROM public.lead_notes) AS lead_notes_count,
  (SELECT COUNT(*) FROM public.opportunities) AS opportunities_count,
  (SELECT COUNT(*) FROM public.tasks) AS tasks_count,
  (SELECT COUNT(*) FROM public.email_sends) AS email_sends_count,
  (SELECT COUNT(*) FROM public.interactions) AS interactions_count;
