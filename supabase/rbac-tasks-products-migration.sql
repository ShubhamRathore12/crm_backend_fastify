-- ============================================================
-- RBAC + Task Notifications + Opportunity Products migration
-- Run in Supabase SQL editor or via supabase db push.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- 1. GROUPS  (a "group" = a named bundle of module permissions)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,   -- system groups can't be deleted
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS groups_name_idx ON public.groups (name);

DROP TRIGGER IF EXISTS groups_updated_at ON public.groups;
CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Attach users to a group (in addition to the legacy team_id / role).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_group_id_idx ON public.users (group_id);

-- ------------------------------------------------------------
-- 2. GROUP PERMISSIONS  (per module CRUD flags for a group)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id    UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  can_read    BOOLEAN NOT NULL DEFAULT FALSE,
  can_write   BOOLEAN NOT NULL DEFAULT FALSE,   -- create
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,   -- update
  can_delete  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, module)
);

CREATE INDEX IF NOT EXISTS group_permissions_group_id_idx ON public.group_permissions (group_id);

DROP TRIGGER IF EXISTS group_permissions_updated_at ON public.group_permissions;
CREATE TRIGGER group_permissions_updated_at
  BEFORE UPDATE ON public.group_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 3. USER PERMISSIONS  (per-user override; NULL flag = inherit group)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,
  can_read    BOOLEAN,
  can_write   BOOLEAN,
  can_edit    BOOLEAN,
  can_delete  BOOLEAN,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module)
);

CREATE INDEX IF NOT EXISTS user_permissions_user_id_idx ON public.user_permissions (user_id);

DROP TRIGGER IF EXISTS user_permissions_updated_at ON public.user_permissions;
CREATE TRIGGER user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------
-- 4. SEED system groups + default permission matrix
--    Modules kept in sync with backend/src/config/modules.js
-- ------------------------------------------------------------
DO $$
DECLARE
  modules TEXT[] := ARRAY[
    'dashboard','leads','opportunities','contacts','interactions','tickets',
    'tasks','campaigns','templates','workflows','calls','calendar','inbox',
    'reports','sales_marketing','integrations','users','settings','access_control'
  ];
  m TEXT;
  g_admin   UUID;
  g_manager UUID;
  g_agent   UUID;
  g_viewer  UUID;
BEGIN
  INSERT INTO public.groups (name, description, is_system)
    VALUES ('Administrators', 'Full access to everything', TRUE)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO public.groups (name, description, is_system)
    VALUES ('Managers', 'Manage all operational modules', TRUE)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO public.groups (name, description, is_system)
    VALUES ('Agents', 'Day-to-day CRM work, no admin', TRUE)
    ON CONFLICT (name) DO NOTHING;
  INSERT INTO public.groups (name, description, is_system)
    VALUES ('Viewers', 'Read-only access', TRUE)
    ON CONFLICT (name) DO NOTHING;

  SELECT id INTO g_admin   FROM public.groups WHERE name = 'Administrators';
  SELECT id INTO g_manager FROM public.groups WHERE name = 'Managers';
  SELECT id INTO g_agent   FROM public.groups WHERE name = 'Agents';
  SELECT id INTO g_viewer  FROM public.groups WHERE name = 'Viewers';

  FOREACH m IN ARRAY modules LOOP
    -- Administrators: everything
    INSERT INTO public.group_permissions (group_id, module, can_read, can_write, can_edit, can_delete)
      VALUES (g_admin, m, TRUE, TRUE, TRUE, TRUE)
      ON CONFLICT (group_id, module) DO NOTHING;

    -- Managers: full on everything except access_control (read-only)
    INSERT INTO public.group_permissions (group_id, module, can_read, can_write, can_edit, can_delete)
      VALUES (
        g_manager, m,
        TRUE,
        m <> 'access_control',
        m <> 'access_control',
        m NOT IN ('access_control','users','settings')
      )
      ON CONFLICT (group_id, module) DO NOTHING;

    -- Agents: operational modules read/write/edit, no delete, no admin modules
    INSERT INTO public.group_permissions (group_id, module, can_read, can_write, can_edit, can_delete)
      VALUES (
        g_agent, m,
        m NOT IN ('access_control'),
        m NOT IN ('access_control','users','settings','reports'),
        m NOT IN ('access_control','users','settings','reports'),
        FALSE
      )
      ON CONFLICT (group_id, module) DO NOTHING;

    -- Viewers: read only on non-admin modules
    INSERT INTO public.group_permissions (group_id, module, can_read, can_write, can_edit, can_delete)
      VALUES (g_viewer, m, m NOT IN ('access_control','users','settings'), FALSE, FALSE, FALSE)
      ON CONFLICT (group_id, module) DO NOTHING;
  END LOOP;

  -- Backfill: map existing users' role -> system group when they have no group yet.
  UPDATE public.users SET group_id = g_admin   WHERE group_id IS NULL AND role = 'admin';
  UPDATE public.users SET group_id = g_manager WHERE group_id IS NULL AND role = 'manager';
  UPDATE public.users SET group_id = g_viewer  WHERE group_id IS NULL AND role = 'viewer';
  UPDATE public.users SET group_id = g_agent   WHERE group_id IS NULL AND role IN ('user','agent');
END $$;

-- ------------------------------------------------------------
-- 5. OPPORTUNITY PRODUCT  (latest stored on row + full history)
-- ------------------------------------------------------------
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS product TEXT;

CREATE TABLE IF NOT EXISTS public.opportunity_product_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  opportunity_id  UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  product         TEXT NOT NULL,
  changed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS opp_product_history_opp_id_idx
  ON public.opportunity_product_history (opportunity_id, created_at DESC);

-- ------------------------------------------------------------
-- 6. TASK ASSIGNMENT NOTIFICATION LOG (audit of notification emails)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  to_email    TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'assignment',
  status      TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_notifications_task_id_idx ON public.task_notifications (task_id);

-- ------------------------------------------------------------
-- 7. GRANTS
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_product_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_notifications TO authenticated;
