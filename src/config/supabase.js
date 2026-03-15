'use strict';

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

/**
 * Admin Supabase client using service role key.
 * Bypasses Row Level Security — use only in server-side code.
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'crm-backend',
      },
    },
  }
);

/**
 * Public Supabase client using anon key.
 * Respects Row Level Security — for user-facing operations.
 */
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: false,
    },
  }
);

/**
 * Health check for Supabase connection.
 * @returns {Promise<boolean>}
 */
async function checkSupabaseHealth() {
  try {
    const { error } = await supabase.from('contacts').select('id').limit(1);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase health check failed:', err.message);
    return false;
  }
}

/**
 * Paginate through all rows of a query using range.
 * @param {Function} queryBuilder - Function that returns a Supabase query
 * @param {number} pageSize - Rows per page (default 1000)
 * @yields {Array} Each page of rows
 */
async function* paginateQuery(queryBuilder, pageSize = 1000) {
  let offset = 0;
  while (true) {
    const { data, error, count } = await queryBuilder(offset, pageSize);
    if (error) throw error;
    if (!data || data.length === 0) break;
    yield data;
    if (data.length < pageSize) break;
    offset += pageSize;
  }
}

module.exports = { supabase, supabasePublic, checkSupabaseHealth, paginateQuery };
