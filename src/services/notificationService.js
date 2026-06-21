'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/supabase');
const { sendEmail, createEmailLog } = require('./emailService');

const APP_URL = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'https://primeosys.com/crm';

/**
 * Resolve a user's email + name by id.
 * @param {string} userId
 * @returns {Promise<{email:string,name:string}|null>}
 */
async function resolveUser(userId) {
  if (!userId) return null;
  const { data } = await supabase.from('users').select('email, name').eq('id', userId).single();
  if (!data || !data.email) return null;
  return data;
}

function buildTaskEmail(task, recipientName) {
  const title = task.title || task.subject || 'New task';
  const due = task.due_date ? new Date(task.due_date).toLocaleString() : 'No due date';
  const priority = task.priority || 'normal';
  const link = `${APP_URL}/sales-marketing`;

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a">
    <h2 style="margin:0 0 8px">A task was assigned to you</h2>
    <p style="color:#555;margin:0 0 16px">Hi ${recipientName || 'there'}, a task has been assigned to you in the CRM.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px">
      <tr><td style="padding:6px 0;color:#888;width:120px">Task</td><td style="padding:6px 0;font-weight:600">${escapeHtml(title)}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Priority</td><td style="padding:6px 0">${escapeHtml(priority)}</td></tr>
      <tr><td style="padding:6px 0;color:#888">Due</td><td style="padding:6px 0">${escapeHtml(due)}</td></tr>
      ${task.description ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top">Details</td><td style="padding:6px 0">${escapeHtml(task.description)}</td></tr>` : ''}
    </table>
    <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Open in CRM</a>
    <p style="color:#999;font-size:12px;margin-top:24px">You received this because you are the assignee of this task.</p>
  </body></html>`;

  const text = `A task was assigned to you.\n\nTask: ${title}\nPriority: ${priority}\nDue: ${due}\n${task.description ? `Details: ${task.description}\n` : ''}\nOpen: ${link}`;

  return { subject: `Task assigned: ${title}`, html, text };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Send a "task assigned to you" email. Fire-and-forget — never throws.
 * @param {Object} task - task row (must contain id + assigned_to/assignee_id)
 */
async function notifyTaskAssigned(task) {
  try {
    const assigneeId = task.assigned_to || task.assignee_id;
    if (!assigneeId) return;

    const user = await resolveUser(assigneeId);
    if (!user) return;

    const { subject, html, text } = buildTaskEmail(task, user.name);

    const emailLogId = await createEmailLog({
      id: uuidv4(),
      campaignId: null,
      contactId: null,
      email: user.email,
    });

    let status = 'sent';
    let errMsg = null;
    try {
      const res = await sendEmail({
        to: user.email,
        subject,
        htmlBody: html,
        textBody: text,
        campaignId: null,
        contactId: null,
        emailLogId,
      });
      if (res && res.skipped) status = 'skipped';
    } catch (e) {
      status = 'failed';
      errMsg = e.message;
      console.error('[Notify] task email failed:', e.message);
    }

    await supabase.from('task_notifications').insert({
      id: uuidv4(),
      task_id: task.id,
      user_id: assigneeId,
      to_email: user.email,
      type: 'assignment',
      status,
      error: errMsg,
      created_at: new Date().toISOString(),
    }).then(() => {}).catch(() => {});
  } catch (err) {
    console.error('[Notify] notifyTaskAssigned error:', err.message);
  }
}

module.exports = { notifyTaskAssigned };
