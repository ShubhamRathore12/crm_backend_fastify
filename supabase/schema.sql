-- ============================================================
-- CRM Backend - Full PostgreSQL Schema
-- Run this in your Supabase SQL editor or via supabase db push
-- ============================================================

-- Create roles required by PostgREST
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

-- Grant schema usage to roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contacts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT NOT NULL,
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  company         TEXT NOT NULL DEFAULT '',
  tags            TEXT[] NOT NULL DEFAULT '{}',
  custom_fields   JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive', 'unsubscribed', 'bounced', 'complained')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_unique_idx
  ON public.contacts (LOWER(email));

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS contacts_status_idx ON public.contacts (status);
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts (company);
CREATE INDEX IF NOT EXISTS contacts_created_at_idx ON public.contacts (created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_tags_gin_idx ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS contacts_custom_fields_gin_idx ON public.contacts USING GIN (custom_fields);
CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx ON public.contacts USING GIN (email gin_trgm_ops);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- LEAD UPLOADS HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lead_uploads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bulk_upload_id  UUID NOT NULL REFERENCES public.bulk_uploads(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_file     TEXT NOT NULL,
  row_number      INTEGER NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('created', 'updated', 'skipped')),
  data_before     JSONB,
  data_after      JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_uploads_bulk_upload_id_idx ON public.lead_uploads (bulk_upload_id);
CREATE INDEX IF NOT EXISTS lead_uploads_lead_id_idx ON public.lead_uploads (lead_id);
CREATE INDEX IF NOT EXISTS lead_uploads_created_at_idx ON public.lead_uploads (created_at DESC);
CREATE INDEX IF NOT EXISTS lead_uploads_action_idx ON public.lead_uploads (action);

-- ============================================================
-- TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  html_body   TEXT NOT NULL DEFAULT '',
  text_body   TEXT NOT NULL DEFAULT '',
  variables   TEXT[] NOT NULL DEFAULT '{}',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS templates_name_idx ON public.templates (name);
CREATE INDEX IF NOT EXISTS templates_created_at_idx ON public.templates (created_at DESC);

CREATE TRIGGER templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaigns (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                    TEXT NOT NULL,
  subject                 TEXT NOT NULL DEFAULT '',
  template_id             UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  segment_query           JSONB,
  status                  TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'scheduled', 'queued', 'running', 'dispatched', 'paused', 'cancelled', 'completed', 'failed')),
  scheduled_at            TIMESTAMPTZ,
  started_at              TIMESTAMPTZ,
  dispatch_completed_at   TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  sent_count              INTEGER NOT NULL DEFAULT 0,
  queued_count            INTEGER NOT NULL DEFAULT 0,
  reply_to                TEXT,
  provider_stats          JSONB NOT NULL DEFAULT '{}',
  error_message           TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaigns_status_idx ON public.campaigns (status);
CREATE INDEX IF NOT EXISTS campaigns_scheduled_at_idx ON public.campaigns (scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_created_at_idx ON public.campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS campaigns_template_id_idx ON public.campaigns (template_id);

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- EMAIL LOGS
-- Individual send record per contact per campaign
-- ============================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id   UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id    UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  provider      TEXT CHECK (provider IN ('ses', 'sendgrid', 'mailgun')),
  message_id    TEXT,  -- Provider message ID for webhook matching
  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed', 'skipped')),
  skip_reason   TEXT,  -- 'bounce' | 'unsubscribe'
  error_message TEXT,
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes for high-volume operations
CREATE INDEX IF NOT EXISTS email_logs_campaign_id_idx ON public.email_logs (campaign_id);
CREATE INDEX IF NOT EXISTS email_logs_contact_id_idx ON public.email_logs (contact_id);
CREATE INDEX IF NOT EXISTS email_logs_email_idx ON public.email_logs (email);
CREATE INDEX IF NOT EXISTS email_logs_status_idx ON public.email_logs (status);
CREATE INDEX IF NOT EXISTS email_logs_message_id_idx ON public.email_logs (message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_campaign_status_idx ON public.email_logs (campaign_id, status);
CREATE INDEX IF NOT EXISTS email_logs_sent_at_idx ON public.email_logs (sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_logs_created_at_idx ON public.email_logs (created_at DESC);

-- Partial index for analytics (sent emails)
CREATE INDEX IF NOT EXISTS email_logs_sent_analytics_idx
  ON public.email_logs (campaign_id, provider, sent_at)
  WHERE status IN ('sent', 'delivered', 'opened', 'clicked');

CREATE TRIGGER email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- BOUNCES
-- Stores bounce events from provider webhooks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bounces (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL,
  bounce_type   TEXT NOT NULL CHECK (bounce_type IN ('hard', 'soft', 'complaint')),
  provider      TEXT CHECK (provider IN ('ses', 'sendgrid', 'mailgun')),
  raw_data      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bounces_email_idx ON public.bounces (email);
CREATE INDEX IF NOT EXISTS bounces_bounce_type_idx ON public.bounces (bounce_type);
CREATE INDEX IF NOT EXISTS bounces_provider_idx ON public.bounces (provider);
CREATE INDEX IF NOT EXISTS bounces_created_at_idx ON public.bounces (created_at DESC);

-- ============================================================
-- UNSUBSCRIBES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unsubscribes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT NOT NULL,
  campaign_id   UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS unsubscribes_email_unique_idx ON public.unsubscribes (LOWER(email));
CREATE INDEX IF NOT EXISTS unsubscribes_campaign_id_idx ON public.unsubscribes (campaign_id);
CREATE INDEX IF NOT EXISTS unsubscribes_created_at_idx ON public.unsubscribes (created_at DESC);

-- ============================================================
-- PROVIDER STATS
-- Daily aggregate stats per provider
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_stats (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider        TEXT NOT NULL CHECK (provider IN ('ses', 'sendgrid', 'mailgun')),
  date            DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  bounce_count    INTEGER NOT NULL DEFAULT 0,
  complaint_count INTEGER NOT NULL DEFAULT 0,
  delivery_count  INTEGER NOT NULL DEFAULT 0,
  open_count      INTEGER NOT NULL DEFAULT 0,
  click_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, date)
);

CREATE INDEX IF NOT EXISTS provider_stats_date_idx ON public.provider_stats (date DESC);
CREATE INDEX IF NOT EXISTS provider_stats_provider_idx ON public.provider_stats (provider);

CREATE TRIGGER provider_stats_updated_at
  BEFORE UPDATE ON public.provider_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- API KEYS
-- For API key authentication
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  scopes        TEXT[] NOT NULL DEFAULT '{"*"}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_account_id_idx ON public.api_keys (account_id);
CREATE INDEX IF NOT EXISTS api_keys_active_idx ON public.api_keys (active) WHERE active = TRUE;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get unique tags across all contacts
CREATE OR REPLACE FUNCTION get_unique_tags()
RETURNS TABLE(tag TEXT, contact_count BIGINT) AS $$
BEGIN
  RETURN QUERY
    SELECT
      unnest(tags) AS tag,
      COUNT(id) AS contact_count
    FROM public.contacts
    WHERE status = 'active'
    GROUP BY tag
    ORDER BY contact_count DESC, tag ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to get campaign stats summary
CREATE OR REPLACE FUNCTION get_campaign_stats(p_campaign_id UUID)
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'queued', COUNT(*) FILTER (WHERE status = 'queued'),
    'sent', COUNT(*) FILTER (WHERE status IN ('sent', 'delivered', 'opened', 'clicked')),
    'delivered', COUNT(*) FILTER (WHERE status = 'delivered'),
    'opened', COUNT(*) FILTER (WHERE status = 'opened'),
    'clicked', COUNT(*) FILTER (WHERE status = 'clicked'),
    'bounced', COUNT(*) FILTER (WHERE status = 'bounced'),
    'complained', COUNT(*) FILTER (WHERE status = 'complained'),
    'unsubscribed', COUNT(*) FILTER (WHERE status = 'unsubscribed'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE status = 'skipped')
  )
  INTO result
  FROM public.email_logs
  WHERE campaign_id = p_campaign_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to upsert daily provider stats
CREATE OR REPLACE FUNCTION upsert_provider_stats(
  p_provider TEXT,
  p_date DATE,
  p_sent INTEGER DEFAULT 0,
  p_bounced INTEGER DEFAULT 0,
  p_complained INTEGER DEFAULT 0,
  p_delivered INTEGER DEFAULT 0,
  p_opened INTEGER DEFAULT 0,
  p_clicked INTEGER DEFAULT 0
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.provider_stats (provider, date, sent_count, bounce_count, complaint_count, delivery_count, open_count, click_count)
  VALUES (p_provider, p_date, p_sent, p_bounced, p_complained, p_delivered, p_opened, p_clicked)
  ON CONFLICT (provider, date)
  DO UPDATE SET
    sent_count = provider_stats.sent_count + EXCLUDED.sent_count,
    bounce_count = provider_stats.bounce_count + EXCLUDED.bounce_count,
    complaint_count = provider_stats.complaint_count + EXCLUDED.complaint_count,
    delivery_count = provider_stats.delivery_count + EXCLUDED.delivery_count,
    open_count = provider_stats.open_count + EXCLUDED.open_count,
    click_count = provider_stats.click_count + EXCLUDED.click_count,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (optional — enable if using multi-tenant)
-- ============================================================
-- ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.bounces ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.unsubscribes ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED DATA (for testing)
-- ============================================================

-- Insert a sample template
INSERT INTO public.templates (id, name, subject, html_body, text_body, variables)
VALUES (
  uuid_generate_v4(),
  'Welcome Email',
  'Welcome to {{company}}, {{first_name}}!',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h1 style="color:#333">Hello, {{first_name}}!</h1>
    <p>Welcome to <strong>{{company}}</strong>. We are glad to have you on board.</p>
    <p>If you have any questions, feel free to reply to this email.</p>
    <p style="color:#666;font-size:14px">Best regards,<br>The Team</p>
  </body></html>',
  'Hello, {{first_name}}!

Welcome to {{company}}. We are glad to have you on board.

If you have any questions, feel free to reply to this email.

Best regards,
The Team',
  ARRAY['first_name', 'company']
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VIEWS for analytics
-- ============================================================

CREATE OR REPLACE VIEW public.campaign_analytics AS
SELECT
  c.id AS campaign_id,
  c.name AS campaign_name,
  c.status,
  c.created_at,
  c.started_at,
  c.completed_at,
  COUNT(el.id) AS total_recipients,
  COUNT(el.id) FILTER (WHERE el.status IN ('sent', 'delivered', 'opened', 'clicked')) AS sent_count,
  COUNT(el.id) FILTER (WHERE el.status = 'delivered') AS delivered_count,
  COUNT(el.id) FILTER (WHERE el.status = 'opened') AS opened_count,
  COUNT(el.id) FILTER (WHERE el.status = 'clicked') AS clicked_count,
  COUNT(el.id) FILTER (WHERE el.status = 'bounced') AS bounced_count,
  COUNT(el.id) FILTER (WHERE el.status = 'complained') AS complained_count,
  COUNT(el.id) FILTER (WHERE el.status = 'unsubscribed') AS unsubscribed_count,
  COUNT(el.id) FILTER (WHERE el.status = 'failed') AS failed_count,
  ROUND(
    COUNT(el.id) FILTER (WHERE el.status = 'opened')::NUMERIC /
    NULLIF(COUNT(el.id) FILTER (WHERE el.status IN ('sent', 'delivered', 'opened', 'clicked')), 0) * 100, 2
  ) AS open_rate_pct,
  ROUND(
    COUNT(el.id) FILTER (WHERE el.status = 'clicked')::NUMERIC /
    NULLIF(COUNT(el.id) FILTER (WHERE el.status IN ('sent', 'delivered', 'opened', 'clicked')), 0) * 100, 2
  ) AS click_rate_pct,
  ROUND(
    COUNT(el.id) FILTER (WHERE el.status = 'bounced')::NUMERIC /
    NULLIF(COUNT(el.id) FILTER (WHERE el.status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced')), 0) * 100, 2
  ) AS bounce_rate_pct
FROM public.campaigns c
LEFT JOIN public.email_logs el ON el.campaign_id = c.id
GROUP BY c.id, c.name, c.status, c.created_at, c.started_at, c.completed_at;

COMMENT ON VIEW public.campaign_analytics IS 'Aggregated analytics view for all campaigns';

-- Grant permissions (adjust to your Supabase roles)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT SELECT ON public.campaign_analytics TO authenticated;
