'use strict';

const { google } = require('googleapis');
const { supabase } = require('../config/supabase');

/**
 * Google Calendar / Google Meet integration.
 *
 * Creating a *real*, joinable Google Meet link requires creating a Google
 * Calendar event with conferenceData (conferenceDataVersion = 1). The returned
 * `hangoutLink` is the live meeting URL and the event appears on the organizer
 * and attendees' Google Calendars.
 *
 * Two auth modes are supported (auto-detected from env / DB):
 *   1. Service account with domain-wide delegation (Google Workspace).
 *      Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_IMPERSONATE_EMAIL.
 *   2. OAuth2 user authorization (any Google account).
 *      Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET; the refresh token is taken
 *      from GOOGLE_REFRESH_TOKEN or from the stored `google` integration.
 *
 * When neither is configured, createMeetingEvent() returns null and callers
 * fall back to a generated (non-joinable) placeholder link.
 */

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function hasServiceAccount() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_IMPERSONATE_EMAIL);
}

function hasOAuthEnv() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function defaultRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.APP_BASE_URL || 'http://localhost:3000'}/settings`;
}

function newOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri || defaultRedirectUri()
  );
}

async function getStoredGoogleConfig() {
  try {
    const { data } = await supabase
      .from('integration_connections')
      .select('config')
      .eq('provider', 'google')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    return (data || [])[0]?.config || null;
  } catch {
    return null;
  }
}

/**
 * Build an authorized client, or null if the integration is not configured.
 */
async function getAuthClient() {
  if (hasServiceAccount()) {
    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const jwt = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
      subject: process.env.GOOGLE_IMPERSONATE_EMAIL,
    });
    await jwt.authorize();
    return jwt;
  }

  if (hasOAuthEnv()) {
    let refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      const cfg = await getStoredGoogleConfig();
      refreshToken = cfg?.refresh_token;
    }
    if (!refreshToken) return null;
    const client = newOAuthClient();
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  return null;
}

/**
 * @returns {Promise<{configured: boolean, mode: string}>}
 */
async function getStatus() {
  if (hasServiceAccount()) return { configured: true, mode: 'service_account' };
  if (hasOAuthEnv()) {
    if (process.env.GOOGLE_REFRESH_TOKEN) return { configured: true, mode: 'oauth' };
    const cfg = await getStoredGoogleConfig();
    return { configured: !!cfg?.refresh_token, mode: 'oauth', available: true };
  }
  return { configured: false, mode: 'none' };
}

/**
 * Create a Google Calendar event with a Meet conference.
 * @returns {Promise<{eventId,htmlLink,hangoutLink}|null>} null if not configured.
 */
async function createMeetingEvent({ summary, description, start, end, attendees, timezone }) {
  const auth = await getAuthClient();
  if (!auth) return null;

  const calendar = google.calendar({ version: 'v3', auth });
  const requestId = `crm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const startIso = start || new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const endIso = end || new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: summary || 'CRM Meeting',
      description: description || '',
      start: { dateTime: startIso, timeZone: timezone || 'UTC' },
      end: { dateTime: endIso, timeZone: timezone || 'UTC' },
      attendees: (attendees || []).filter(Boolean).map((email) => ({ email })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const ev = res.data;
  const hangoutLink =
    ev.hangoutLink ||
    (ev.conferenceData?.entryPoints || []).find((p) => p.entryPointType === 'video')?.uri ||
    null;

  return { eventId: ev.id, htmlLink: ev.htmlLink, hangoutLink };
}

// ── OAuth helpers (for the connect flow) ──────────────────────
function getAuthUrl(redirectUri) {
  if (!hasOAuthEnv()) throw new Error('Google OAuth client not configured (GOOGLE_CLIENT_ID/SECRET)');
  const client = newOAuthClient(redirectUri);
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

async function exchangeCode(code, redirectUri) {
  const client = newOAuthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  return tokens; // { refresh_token, access_token, ... }
}

module.exports = {
  getStatus,
  createMeetingEvent,
  getAuthUrl,
  exchangeCode,
  hasOAuthEnv,
  hasServiceAccount,
};
