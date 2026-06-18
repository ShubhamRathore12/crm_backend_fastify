'use strict';

const crypto = require('crypto');

/**
 * Google Meet link helper.
 *
 * createMeeting() creates a REAL, joinable Meet link by inserting a Google
 * Calendar event (via googleCalendarService) when Google credentials are
 * configured — this also schedules the call on Google Calendar for the
 * organizer and any attendees.
 *
 * generateMeetLink() is the offline fallback: a syntactically valid but
 * non-joinable code, used only when Google is not connected so the rest of
 * the flow keeps working in development.
 */
function randomLetters(n) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const bytes = crypto.randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * @returns {string} A placeholder Meet URL, e.g. https://meet.google.com/abc-defg-hij
 */
function generateMeetLink() {
  const code = `${randomLetters(3)}-${randomLetters(4)}-${randomLetters(3)}`;
  return `https://meet.google.com/${code}`;
}

/**
 * Create a meeting. Tries the real Google Calendar API first; falls back to a
 * generated link if Google is not configured or the API call fails.
 *
 * @param {object} opts { summary, description, start, end, attendees }
 * @returns {Promise<{link:string, real:boolean, eventId?:string, htmlLink?:string}>}
 */
async function createMeeting(opts = {}) {
  try {
    const google = require('./googleCalendarService');
    const result = await google.createMeetingEvent({
      summary: opts.summary,
      description: opts.description,
      start: opts.start,
      end: opts.end,
      attendees: opts.attendees || [],
    });
    if (result && result.hangoutLink) {
      return {
        link: result.hangoutLink,
        real: true,
        eventId: result.eventId,
        htmlLink: result.htmlLink,
      };
    }
  } catch (err) {
    // Swallow and fall back — never block the CRM action on Google availability.
    if (process.env.LOG_LEVEL !== 'silent') {
      console.warn('[meetService] Google Calendar create failed, using fallback:', err.message);
    }
  }
  return { link: generateMeetLink(), real: false };
}

module.exports = { generateMeetLink, createMeeting };
