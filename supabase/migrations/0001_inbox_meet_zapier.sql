-- ============================================================
-- INBOX / OUTBOX (inbound + outbound email threads)
-- Feature: unified inbox, outbox send, Google Meet invites
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name    TEXT,
  contact_email   TEXT,
  subject         TEXT NOT NULL DEFAULT '(no subject)',
  status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'open', 'replied', 'closed', 'archived')),
  priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  folder          TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'outbox', 'sent')),
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  mailbox         TEXT NOT NULL DEFAULT 'sushilpradhan',
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbound_emails_status_idx ON public.inbound_emails (status);
CREATE INDEX IF NOT EXISTS inbound_emails_folder_idx ON public.inbound_emails (folder);
CREATE INDEX IF NOT EXISTS inbound_emails_mailbox_idx ON public.inbound_emails (mailbox);
CREATE INDEX IF NOT EXISTS inbound_emails_created_at_idx ON public.inbound_emails (created_at DESC);

CREATE TABLE IF NOT EXISTS public.inbound_email_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email_id        UUID NOT NULL REFERENCES public.inbound_emails(id) ON DELETE CASCADE,
  sender          TEXT NOT NULL,
  sender_email    TEXT,
  direction       TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  content         TEXT NOT NULL DEFAULT '',
  meet_link       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inbound_email_messages_email_id_idx ON public.inbound_email_messages (email_id);
CREATE INDEX IF NOT EXISTS inbound_email_messages_created_at_idx ON public.inbound_email_messages (created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_emails TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbound_email_messages TO authenticated;

-- ============================================================
-- SEED: Sushil Pradhan demo inbox + outbox
-- ============================================================
DO $$
DECLARE
  e1 UUID := uuid_generate_v4();
  e2 UUID := uuid_generate_v4();
  e3 UUID := uuid_generate_v4();
BEGIN
  -- Seed only once (skip if data already exists)
  IF EXISTS (SELECT 1 FROM public.inbound_emails LIMIT 1) THEN RETURN; END IF;

  -- Inbound thread 1
  INSERT INTO public.inbound_emails (id, contact_name, contact_email, subject, status, priority, folder, mailbox)
  VALUES (e1, 'Sushil Pradhan', 'sushil.pradhan@example.com', 'Interested in your Portfolio Management service', 'new', 'high', 'inbox', 'sushilpradhan')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.inbound_email_messages (email_id, sender, sender_email, direction, content)
  VALUES (e1, 'Sushil Pradhan', 'sushil.pradhan@example.com', 'inbound',
    'Hello, I came across your CRM offering and I am keen to learn more about the Portfolio Management service. Could we set up a quick call this week?');

  -- Inbound thread 2
  INSERT INTO public.inbound_emails (id, contact_name, contact_email, subject, status, priority, folder, mailbox)
  VALUES (e2, 'Anita Sharma', 'anita.sharma@example.com', 'Demat account onboarding question', 'open', 'normal', 'inbox', 'sushilpradhan')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.inbound_email_messages (email_id, sender, sender_email, direction, content)
  VALUES (e2, 'Anita Sharma', 'anita.sharma@example.com', 'inbound',
    'Hi team, I submitted my KYC documents yesterday. How long does the demat account activation usually take?');

  -- Outbound (sent) thread 3
  INSERT INTO public.inbound_emails (id, contact_name, contact_email, subject, status, priority, folder, mailbox)
  VALUES (e3, 'Rahul Verma', 'rahul.verma@example.com', 'Your meeting with our advisory team', 'replied', 'normal', 'sent', 'sushilpradhan')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.inbound_email_messages (email_id, sender, sender_email, direction, content, meet_link)
  VALUES (e3, 'Sushil Pradhan', 'sushilpradhan@primeosys.com', 'outbound',
    'Hi Rahul, thanks for your interest. I have scheduled a Google Meet for our advisory session. Please use the link below to join.',
    'https://meet.google.com/abc-defg-hij');
END $$;
