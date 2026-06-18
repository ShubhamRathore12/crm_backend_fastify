-- ============================================================
-- GOOGLE MEET / CALENDAR linkage
-- Store the real Google Calendar event id + link alongside meetings
-- ============================================================

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_html_link TEXT;

ALTER TABLE public.inbound_email_messages
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;
