-- ============================================================
-- Ticket Workspace (omni-channel tickets for the Interactions UI)
-- Stores the full rich ticket object as JSONB so the front-end
-- 3-pane workspace (conversation, account info, customer 360,
-- fast lane) can be served without a wide relational schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_workspace (
  id          TEXT PRIMARY KEY,
  ticket_no   TEXT,
  channel     TEXT,
  status      TEXT,
  priority    TEXT,
  data        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_workspace_channel_idx ON public.ticket_workspace (channel);
CREATE INDEX IF NOT EXISTS ticket_workspace_status_idx  ON public.ticket_workspace (status);
CREATE INDEX IF NOT EXISTS ticket_workspace_created_idx ON public.ticket_workspace (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_workspace TO anon, authenticated, service_role;
