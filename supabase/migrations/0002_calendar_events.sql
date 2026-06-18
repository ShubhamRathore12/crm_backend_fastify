-- ============================================================
-- CALENDAR EVENTS
-- Feature: schedulable events shown on the CRM calendar
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT NOT NULL,
  description     TEXT,
  event_type      TEXT NOT NULL DEFAULT 'event'
                    CHECK (event_type IN ('event', 'meeting', 'call', 'task', 'reminder')),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ,
  all_day         BOOLEAN NOT NULL DEFAULT FALSE,
  location        TEXT,
  meet_link       TEXT,
  contact_id      UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id         UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_to     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calendar_events_start_time_idx ON public.calendar_events (start_time);
CREATE INDEX IF NOT EXISTS calendar_events_event_type_idx ON public.calendar_events (event_type);
CREATE INDEX IF NOT EXISTS calendar_events_contact_id_idx ON public.calendar_events (contact_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;

-- Seed a couple of upcoming demo events (only once)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.calendar_events LIMIT 1) THEN
    INSERT INTO public.calendar_events (title, description, event_type, start_time, end_time, meet_link)
    VALUES
      ('Advisory call with Sushil Pradhan', 'Portfolio management discovery call', 'meeting',
        NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day' + INTERVAL '30 minutes',
        'https://meet.google.com/abc-defg-hij'),
      ('Team pipeline review', 'Weekly sales pipeline sync', 'event',
        NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days' + INTERVAL '1 hour', NULL);
  END IF;
END $$;
