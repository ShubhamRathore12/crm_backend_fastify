'use strict';

const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const { processBounce, processUnsubscribe, processComplaint, updateEmailLog } = require('../services/emailService');
const { addBounceJob } = require('../services/queueService');

/**
 * Verify SendGrid webhook signature.
 * @param {string} publicKey - SendGrid ECDSA public key (base64 DER)
 * @param {Buffer} payload
 * @param {string} signature - base64 signature
 * @param {string} timestamp
 * @returns {boolean}
 */
function verifySendGridSignature(publicKey, payload, signature, timestamp) {
  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(timestamp);
    verify.update(payload);
    return verify.verify(
      `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`,
      signature,
      'base64'
    );
  } catch {
    return false;
  }
}

/**
 * Verify AWS SES SNS webhook signature (simplified — in production use SNS SDK).
 */
function verifySNSSignature(message) {
  // AWS SNS messages are signed; here we trust the message but validate structure
  return message && message.Type && message.Message;
}

/**
 * Verify Mailgun webhook signature.
 * @param {string} apiKey
 * @param {string} timestamp
 * @param {string} token
 * @param {string} signature
 * @returns {boolean}
 */
function verifyMailgunSignature(apiKey, timestamp, token, signature) {
  const value = timestamp + token;
  const hash = crypto.createHmac('sha256', apiKey).update(value).digest('hex');
  return hash === signature;
}

async function webhooksRoutes(fastify, options) {
  // Raw body parsing is needed for signature verification
  fastify.addContentTypeParser(
    ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
    { parseAs: 'buffer' },
    (req, body, done) => done(null, body)
  );

  /**
   * POST /webhooks/ses
   * AWS SES bounce/complaint notifications via SNS.
   */
  fastify.post('/ses', async (request, reply) => {
    let body;
    try {
      body = JSON.parse(request.body.toString());
    } catch {
      return reply.code(400).send({ error: 'Invalid JSON' });
    }

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      request.log.info({ url: body.SubscribeURL }, 'SNS subscription confirmation');
      // In production, automatically confirm by fetching the URL
      return reply.send({ status: 'subscription_confirmation_received' });
    }

    if (body.Type !== 'Notification') {
      return reply.send({ status: 'ignored' });
    }

    let notification;
    try {
      notification = JSON.parse(body.Message);
    } catch {
      return reply.code(400).send({ error: 'Invalid SNS message' });
    }

    const notificationType = notification.notificationType;

    try {
      if (notificationType === 'Bounce') {
        const bounce = notification.bounce;
        const bounceType = bounce.bounceType === 'Permanent' ? 'hard' : 'soft';

        for (const recipient of bounce.bouncedRecipients) {
          await addBounceJob({
            email: recipient.emailAddress,
            bounceType,
            provider: 'ses',
            rawData: { bounce, recipient },
          });

          // Update email log if we can find it
          if (notification.mail?.messageId) {
            await supabase
              .from('email_logs')
              .update({ status: 'bounced', updated_at: new Date().toISOString() })
              .eq('message_id', notification.mail.messageId);
          }
        }
      } else if (notificationType === 'Complaint') {
        const complaint = notification.complaint;
        for (const recipient of complaint.complainedRecipients) {
          await processComplaint(recipient.emailAddress, 'ses', { complaint, notification });
          if (notification.mail?.messageId) {
            await supabase
              .from('email_logs')
              .update({ status: 'complained', updated_at: new Date().toISOString() })
              .eq('message_id', notification.mail.messageId);
          }
        }
      } else if (notificationType === 'Delivery') {
        if (notification.mail?.messageId) {
          await supabase
            .from('email_logs')
            .update({ status: 'delivered', updated_at: new Date().toISOString() })
            .eq('message_id', notification.mail.messageId);
        }
      }
    } catch (err) {
      request.log.error({ err }, 'Error processing SES webhook');
    }

    return reply.send({ status: 'processed' });
  });

  /**
   * POST /webhooks/sendgrid
   * SendGrid event webhook.
   * Handles: delivered, open, click, bounce, spamreport, unsubscribe.
   */
  fastify.post('/sendgrid', async (request, reply) => {
    const signature = request.headers['x-twilio-email-event-webhook-signature'];
    const timestamp = request.headers['x-twilio-email-event-webhook-timestamp'];

    // Verify signature if configured
    if (process.env.SENDGRID_WEBHOOK_PUBLIC_KEY && signature && timestamp) {
      const isValid = verifySendGridSignature(
        process.env.SENDGRID_WEBHOOK_PUBLIC_KEY,
        request.body,
        signature,
        timestamp
      );
      if (!isValid) {
        return reply.code(403).send({ error: 'Invalid webhook signature' });
      }
    }

    let events;
    try {
      events = JSON.parse(request.body.toString());
      if (!Array.isArray(events)) events = [events];
    } catch {
      return reply.code(400).send({ error: 'Invalid JSON' });
    }

    const results = await Promise.allSettled(
      events.map(async (event) => {
        const email = event.email;
        const messageId = event.sg_message_id?.split('.')[0]; // strip suffix
        const emailLogId = event.email_log_id;
        const campaignId = event.campaign_id;
        const timestamp_s = event.timestamp ? new Date(event.timestamp * 1000).toISOString() : new Date().toISOString();

        switch (event.event) {
          case 'delivered':
            if (emailLogId || messageId) {
              const query = supabase.from('email_logs').update({
                status: 'delivered',
                updated_at: timestamp_s,
              });
              if (emailLogId) await query.eq('id', emailLogId);
              else if (messageId) await query.eq('message_id', messageId);
            }
            break;

          case 'open':
            if (emailLogId || messageId) {
              const query = supabase.from('email_logs').update({
                status: 'opened',
                opened_at: timestamp_s,
                updated_at: timestamp_s,
              });
              if (emailLogId) await query.eq('id', emailLogId);
              else if (messageId) await query.eq('message_id', messageId);
            }
            break;

          case 'click':
            if (emailLogId || messageId) {
              const query = supabase.from('email_logs').update({
                status: 'clicked',
                clicked_at: timestamp_s,
                updated_at: timestamp_s,
              });
              if (emailLogId) await query.eq('id', emailLogId);
              else if (messageId) await query.eq('message_id', messageId);
            }
            break;

          case 'bounce':
          case 'blocked': {
            const bounceType = event.type === 'bounce' ? 'hard' : 'soft';
            await addBounceJob({ email, bounceType, provider: 'sendgrid', rawData: event });
            if (emailLogId || messageId) {
              const query = supabase.from('email_logs').update({
                status: 'bounced',
                updated_at: timestamp_s,
              });
              if (emailLogId) await query.eq('id', emailLogId);
              else if (messageId) await query.eq('message_id', messageId);
            }
            break;
          }

          case 'spamreport':
            await processComplaint(email, 'sendgrid', event);
            if (emailLogId || messageId) {
              const query = supabase.from('email_logs').update({
                status: 'complained',
                updated_at: timestamp_s,
              });
              if (emailLogId) await query.eq('id', emailLogId);
              else if (messageId) await query.eq('message_id', messageId);
            }
            break;

          case 'unsubscribe':
          case 'group_unsubscribe':
            await processUnsubscribe(email, campaignId);
            break;

          default:
            break;
        }
      })
    );

    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      request.log.warn({ failed, total: events.length }, 'Some SendGrid events failed processing');
    }

    return reply.send({ processed: events.length - failed, failed });
  });

  /**
   * POST /webhooks/mailgun
   * Mailgun webhook for delivery, opens, clicks, bounces, complaints, unsubscribes.
   */
  fastify.post('/mailgun', async (request, reply) => {
    let body;
    try {
      // Mailgun sends form data or JSON
      const raw = request.body.toString();
      if (raw.startsWith('{')) {
        body = JSON.parse(raw);
      } else {
        // Parse URL-encoded form data
        body = Object.fromEntries(
          raw.split('&').map((pair) => {
            const [k, v] = pair.split('=');
            return [decodeURIComponent(k), decodeURIComponent(v || '')];
          })
        );
      }
    } catch {
      return reply.code(400).send({ error: 'Invalid body' });
    }

    // Verify Mailgun signature
    const signature = body.signature || body['signature[signature]'];
    const timestamp = body.timestamp || body['signature[timestamp]'];
    const token = body.token || body['signature[token]'];

    if (process.env.MAILGUN_WEBHOOK_SIGNING_KEY && signature) {
      const isValid = verifyMailgunSignature(
        process.env.MAILGUN_WEBHOOK_SIGNING_KEY,
        timestamp,
        token,
        signature
      );
      if (!isValid) {
        return reply.code(403).send({ error: 'Invalid webhook signature' });
      }
    }

    const eventData = body['event-data'] || body;
    const event = eventData.event || body.event;
    const email = eventData.recipient || body.recipient;
    const messageId = eventData['message-id'] || body['message-id'];
    const emailLogId = eventData['user-variables']?.email_log_id || body['user-variables']?.email_log_id;
    const campaignId = eventData['user-variables']?.campaign_id || body['user-variables']?.campaign_id;
    const tsMs = (eventData.timestamp || body.timestamp || Date.now() / 1000) * 1000;
    const eventTime = new Date(tsMs).toISOString();

    try {
      switch (event) {
        case 'delivered':
          if (emailLogId || messageId) {
            const q = supabase.from('email_logs').update({ status: 'delivered', updated_at: eventTime });
            if (emailLogId) await q.eq('id', emailLogId);
            else await q.eq('message_id', messageId);
          }
          break;

        case 'opened':
          if (emailLogId || messageId) {
            const q = supabase.from('email_logs').update({ status: 'opened', opened_at: eventTime, updated_at: eventTime });
            if (emailLogId) await q.eq('id', emailLogId);
            else await q.eq('message_id', messageId);
          }
          break;

        case 'clicked':
          if (emailLogId || messageId) {
            const q = supabase.from('email_logs').update({ status: 'clicked', clicked_at: eventTime, updated_at: eventTime });
            if (emailLogId) await q.eq('id', emailLogId);
            else await q.eq('message_id', messageId);
          }
          break;

        case 'failed':
        case 'permanent_fail':
          if (email) {
            await addBounceJob({ email, bounceType: 'hard', provider: 'mailgun', rawData: eventData });
          }
          if (emailLogId || messageId) {
            const q = supabase.from('email_logs').update({ status: 'bounced', updated_at: eventTime });
            if (emailLogId) await q.eq('id', emailLogId);
            else await q.eq('message_id', messageId);
          }
          break;

        case 'temporary_fail':
          if (emailLogId || messageId) {
            const q = supabase.from('email_logs').update({ status: 'failed', updated_at: eventTime });
            if (emailLogId) await q.eq('id', emailLogId);
            else await q.eq('message_id', messageId);
          }
          break;

        case 'complained':
          if (email) await processComplaint(email, 'mailgun', eventData);
          break;

        case 'unsubscribed':
          if (email) await processUnsubscribe(email, campaignId);
          break;

        default:
          request.log.debug({ event }, 'Unhandled Mailgun event type');
          break;
      }
    } catch (err) {
      request.log.error({ err, event, email }, 'Error processing Mailgun webhook');
    }

    return reply.send({ status: 'ok' });
  });

  /**
   * GET /track/open/:emailLogId
   * Track email opens via 1x1 pixel.
   */
  fastify.get('/track/open/:emailLogId', async (request, reply) => {
    const { emailLogId } = request.params;

    // Fire and forget the update
    supabase.from('email_logs')
      .update({ status: 'opened', opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', emailLogId)
      .neq('status', 'clicked') // don't downgrade from clicked
      .then(() => {})
      .catch(() => {});

    // Return a 1x1 transparent GIF
    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    return reply
      .code(200)
      .header('Content-Type', 'image/gif')
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .header('Pragma', 'no-cache')
      .header('Expires', '0')
      .send(gif);
  });

  /**
   * GET /track/click/:token
   * Track link clicks and redirect.
   */
  fastify.get('/track/click/:token', async (request, reply) => {
    const { token } = request.params;

    let redirectUrl = '/';
    let emailLogId = null;

    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      redirectUrl = decoded.url || '/';
      emailLogId = decoded.id;

      if (emailLogId) {
        supabase.from('email_logs')
          .update({ status: 'clicked', clicked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', emailLogId)
          .then(() => {})
          .catch(() => {});
      }
    } catch (err) {
      request.log.warn({ token }, 'Invalid click tracking token');
    }

    return reply.redirect(301, redirectUrl);
  });

  /**
   * GET /unsubscribe
   * Handle unsubscribe links.
   */
  fastify.get('/unsubscribe', async (request, reply) => {
    const { t: token } = request.query;

    if (!token) {
      return reply.code(400).type('text/html').send('<html><body><h2>Invalid unsubscribe link</h2></body></html>');
    }

    let email = null;
    let campaignId = null;

    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      email = decoded.email;
      campaignId = decoded.cid;

      if (!email) throw new Error('No email in token');
      await processUnsubscribe(email, campaignId);
    } catch (err) {
      request.log.warn({ token, err: err.message }, 'Invalid unsubscribe token');
      return reply.code(400).type('text/html').send(`
        <html><body style="font-family:Arial,sans-serif;text-align:center;padding:50px">
          <h2>Invalid unsubscribe link</h2>
          <p>This link may have expired. Please contact support.</p>
        </body></html>`);
    }

    return reply.type('text/html').send(`
      <html><body style="font-family:Arial,sans-serif;text-align:center;padding:50px;max-width:600px;margin:0 auto">
        <h2>You have been unsubscribed</h2>
        <p>The email address <strong>${email}</strong> has been removed from our mailing list.</p>
        <p style="color:#666;font-size:14px">You will no longer receive emails from us.</p>
      </body></html>`);
  });

  /**
   * POST /unsubscribe
   * Handle POST unsubscribe (List-Unsubscribe-Post header).
   */
  fastify.post('/unsubscribe', async (request, reply) => {
    const { t: token } = request.query;
    let body;

    try {
      body = typeof request.body === 'string'
        ? JSON.parse(request.body)
        : request.body;
    } catch {
      body = {};
    }

    if (!token) {
      return reply.code(400).send({ error: 'Missing token' });
    }

    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
      if (!decoded.email) throw new Error('No email in token');
      await processUnsubscribe(decoded.email, decoded.cid);
    } catch (err) {
      return reply.code(400).send({ error: 'Invalid token' });
    }

    return reply.send({ status: 'unsubscribed' });
  });
}

module.exports = webhooksRoutes;
