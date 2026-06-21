'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Seeds the ticket_workspace table with dummy omni-channel tickets.
// Usage (from backend dir):  node scripts/seed-ticket-workspace.js
// Reads DB connection from env (DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD).
// Idempotent: creates the table if missing and upserts rows by id.
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { Pool } = require('pg');
const { TICKETS } = require('../src/data/ticket-workspace-seed');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'crm_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 8000,
});

const CREATE_SQL = `
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
`;

async function main() {
  const client = await pool.connect();
  try {
    console.log('[seed] ensuring table…');
    await client.query(CREATE_SQL);

    console.log(`[seed] upserting ${TICKETS.length} tickets…`);
    for (const t of TICKETS) {
      await client.query(
        `INSERT INTO public.ticket_workspace (id, ticket_no, channel, status, priority, data, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())
         ON CONFLICT (id) DO UPDATE SET
           ticket_no = EXCLUDED.ticket_no,
           channel   = EXCLUDED.channel,
           status    = EXCLUDED.status,
           priority  = EXCLUDED.priority,
           data      = EXCLUDED.data,
           updated_at = NOW()`,
        [t.id, t.ticketNo, t.channel, t.status, t.priority, JSON.stringify(t), t.createdAt]
      );
      console.log(`  ✓ ${t.id}  ${t.channel.padEnd(9)} ${t.customer.name}`);
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM public.ticket_workspace');
    console.log(`[seed] done. ticket_workspace now has ${rows[0].n} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] FAILED:', err.message);
  process.exit(1);
});
