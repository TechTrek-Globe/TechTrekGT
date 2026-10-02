/**
 * functions/api/ebay/webhook.js - eBay Notification Service Webhook handler for Outpost
 *
 * Routes:
 *   GET  /api/ebay/webhook  - eBay challenge handshake (unauthenticated verification)
 *   POST /api/ebay/webhook  - Receive, cryptographically verify, and dispatch notification events
 *
 * Security:
 *   HMAC-SHA256 signature validation on every POST request.
 *   Rejects requests with missing or invalid signatures with HTTP 401 Unauthorized.
 *   Computes expected signature using raw request body bytes and EBAY_WEBHOOK_SECRET
 *   (with EBAY_NOTIFICATION_SECRET supported as fallback).
 *
 * eBay SLA:
 *   Returns 200 within 3 seconds. Background work scheduled via ctx.waitUntil when available.
 *
 * Events dispatched:
 *   ITEM_SOLD                    -> auction_items.status = 'delist_pending'
 *   ORDER_PAYMENT_STATUS (PAID)  -> status = 'Sold', draft auction_sales via markItemSold
 *   MARKETPLACE_ACCOUNT_DELETION -> DELETE ebay_oauth_tokens (GDPR compliance, mandatory)
 */

import { ok, err } from '../../utils/guard.js';
import { markItemSold } from '../../utils/auction.js';

/**
 * Timing-safe string comparison to mitigate timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Converts ArrayBuffer or Uint8Array to lowercase Hex string.
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {string}
 */
export function bufferToHex(buf) {
  const bytes = new Uint8Array(buf);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts ArrayBuffer or Uint8Array to Base64 string.
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {string}
 */
export function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Computes the HMAC-SHA256 signature buffer of raw request bytes using the secret.
 * @param {ArrayBuffer|Uint8Array|string} rawBody
 * @param {string} secret
 * @returns {Promise<ArrayBuffer>}
 */
export async function computeWebhookSignature(rawBody, secret) {
  if (!secret) throw new Error('Missing webhook secret for signature computation');
  const enc = new TextEncoder();
  const keyBytes = typeof secret === 'string' ? enc.encode(secret) : secret;
  const rawBytes = typeof rawBody === 'string'
    ? enc.encode(rawBody)
    : (rawBody instanceof ArrayBuffer ? new Uint8Array(rawBody) : rawBody);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return crypto.subtle.sign('HMAC', key, rawBytes);
}

/**
 * Extracts signature header across common variations.
 * @param {Request} request
 * @returns {string}
 */
export function getSignatureHeader(request) {
  if (!request || !request.headers) return '';
  return (
    request.headers.get('X-EBAY-SIGNATURE') ||
    request.headers.get('x-ebay-signature') ||
    request.headers.get('X-Signature') ||
    request.headers.get('x-signature') ||
    request.headers.get('X-Hub-Signature-256') ||
    request.headers.get('x-hub-signature-256') ||
    request.headers.get('X-Webhook-Signature') ||
    request.headers.get('x-webhook-signature') ||
    ''
  ).trim();
}

/**
 * Cryptographically validates the HMAC-SHA256 signature against the raw request body.
 * Supports Base64, Hex, and "sha256=" prefixed hex signatures.
 * Returns true if valid, false if invalid, empty, or on error.
 *
 * @param {ArrayBuffer|Uint8Array|string} rawBody
 * @param {string} signatureHeader
 * @param {string} secret
 * @returns {Promise<boolean>}
 */
export async function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const rawBytes = typeof rawBody === 'string'
    ? new TextEncoder().encode(rawBody)
    : (rawBody instanceof ArrayBuffer ? new Uint8Array(rawBody) : rawBody);

  try {
    const expectedSigBuffer = await computeWebhookSignature(rawBytes, secret);
    const expectedHex = bufferToHex(expectedSigBuffer);
    const expectedBase64 = bufferToBase64(expectedSigBuffer);

    let candidate = signatureHeader.trim();
    if (candidate.toLowerCase().startsWith('sha256=')) {
      candidate = candidate.slice(7).trim();
    }

    // 1. Check hex match (case-insensitive, constant-time)
    if (candidate.length === expectedHex.length && timingSafeEqualString(candidate.toLowerCase(), expectedHex.toLowerCase())) {
      return true;
    }

    // 2. Check base64 match (constant-time)
    if (candidate.length === expectedBase64.length && timingSafeEqualString(candidate, expectedBase64)) {
      return true;
    }

    // 3. Check native crypto.subtle.verify if base64 decodable
    try {
      const decodedRaw = atob(candidate);
      const decodedBuf = new Uint8Array(decodedRaw.length);
      for (let i = 0; i < decodedRaw.length; i++) decodedBuf[i] = decodedRaw.charCodeAt(i);

      if (decodedBuf.length === 32) {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['verify']
        );
        const verified = await crypto.subtle.verify('HMAC', key, decodedBuf, rawBytes);
        if (verified) return true;
      }
    } catch (_) {
      // not valid base64
    }

    return false;
  } catch (err) {
    console.error('[verifyWebhookSignature] validation error:', err);
    return false;
  }
}

/**
 * Computes the eBay challenge response for GET verification handshake:
 * SHA-256(challengeCode + notificationSecret + endpointUrl)
 * returned as a lowercase hex string.
 *
 * @param {string} challengeCode
 * @param {string} secret
 * @param {string} endpointUrl
 * @returns {Promise<string>}
 */
export async function buildChallengeResponse(challengeCode, secret, endpointUrl) {
  const payload = challengeCode + secret + endpointUrl;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return bufferToHex(hashBuf);
}

/**
 * Dispatches a validated webhook event to the appropriate D1 tables.
 *
 * @param {string} eventType
 * @param {object} payload
 * @param {string} eventId
 * @param {object} env
 */
export async function dispatchWebhookEvent(eventType, payload, eventId, env) {
  const now = new Date().toISOString();

  try {
    if (!env || !env.DB) {
      console.warn('[ebayWebhook] DB binding not available for event dispatch:', eventId);
      return;
    }

    if (eventType === 'MARKETPLACE_ACCOUNT_DELETION') {
      // GDPR mandatory: delete user OAuth tokens by eBay userId
      const ebayUserId = payload.userId || payload.UserId || payload.user?.userId;
      if (ebayUserId) {
        await env.DB.prepare(
          'DELETE FROM ebay_oauth_tokens WHERE ebay_user_id = ?'
        ).bind(String(ebayUserId)).run();
      }
      await env.DB.prepare(
        'UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?'
      ).bind(now, eventId).run();
      return;
    }

    // Extract eBay listing ID and order ID from various payload shapes
    const ebayItemId = (
      payload.ItemID || payload.itemId ||
      payload.item?.itemId ||
      payload.notification?.data?.itemId ||
      null
    );
    const ebayOrderId = (
      payload.OrderID || payload.orderId ||
      payload.order?.orderId ||
      payload.notification?.data?.orderId ||
      null
    );

    if (eventType === 'ITEM_SOLD' && ebayItemId) {
      // Set item to delist_pending - seller must de-list from other platforms
      await env.DB.prepare(`
        UPDATE auction_items SET
          status = 'delist_pending',
          updated_at = datetime('now')
        WHERE ebay_listing_id = ?
          AND status IN ('Listed', 'Available')
      `).bind(String(ebayItemId)).run();

      await env.DB.prepare(
        'UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?'
      ).bind(now, eventId).run();
      return;
    }

    if (eventType === 'ORDER_PAYMENT_STATUS') {
      const paymentStatus = (
        payload.PaymentStatus || payload.paymentStatus ||
        payload.notification?.data?.paymentStatus || ''
      ).toUpperCase();

      if (paymentStatus === 'PAID' && ebayItemId) {
        // Fetch internal item by ebay_listing_id
        const item = await env.DB.prepare(
          "SELECT * FROM auction_items WHERE ebay_listing_id = ? AND status IN ('delist_pending', 'Listed', 'Available')"
        ).bind(String(ebayItemId)).first();

        if (item) {
          const saleDate = new Date().toISOString().split('T')[0];
          const grossPrice = parseFloat(
            payload.Price || payload.price || payload.notification?.data?.amount || item.actual_sell_price || item.current_list_price || 0
          );

          // Mark item Sold
          await env.DB.prepare(`
            UPDATE auction_items SET
              status = 'Sold',
              actual_sell_price = ?,
              date_sold = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(grossPrice > 0 ? grossPrice : null, saleDate, item.id).run();

          // Check for existing sale row
          const existing = await env.DB.prepare(
            'SELECT id, ebay_order_id FROM auction_sales WHERE item_id = ? AND user_id = ?'
          ).bind(item.id, item.user_id).first();

          if (!existing && grossPrice > 0) {
            try {
              // Upsert sale via shared markItemSold helper
              await markItemSold(env, item.user_id, item, {
                sale_date: saleDate,
                platform: item.platform || 'eBay',
                gross_sale_price: grossPrice,
                ebay_order_id: ebayOrderId || null
              });
            } catch (saleErr) {
              console.error(`[ebayWebhook] Failed to mark sale for item ${item.id}, reverting item status:`, saleErr);
              await env.DB.prepare(`
                UPDATE auction_items SET
                  status = ?,
                  actual_sell_price = ?,
                  date_sold = ?,
                  updated_at = datetime('now')
                WHERE id = ?
              `).bind(item.status, item.actual_sell_price, item.date_sold, item.id).run().catch(() => {});
              throw saleErr;
            }
          } else if (existing && ebayOrderId && !existing.ebay_order_id) {
            // Patch existing sale with eBay order ID
            await env.DB.prepare(
              'UPDATE auction_sales SET ebay_order_id = ? WHERE id = ? AND ebay_order_id IS NULL'
            ).bind(ebayOrderId, existing.id).run();
          }
        }
      }

      await env.DB.prepare(
        'UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?'
      ).bind(now, eventId).run();
      return;
    }

    // Unhandled / acknowledged event type
    await env.DB.prepare(
      'UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?'
    ).bind(now, eventId).run();

  } catch (e) {
    console.error(`[ebayWebhook] dispatch error for event ${eventId}:`, e.message);
    if (env?.DB) {
      await env.DB.prepare(
        'UPDATE ebay_webhook_events SET processed = 2, error_message = ? WHERE id = ?'
      ).bind((e.message || 'Dispatch error').slice(0, 500), eventId).run().catch(() => {});
    }
  }
}

/**
 * GET /api/ebay/webhook
 * eBay challenge handshake - unauthenticated endpoint called by eBay during endpoint registration.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get('challenge_code');

  if (!challengeCode) {
    return ok({ status: 'webhook endpoint active' });
  }

  const secret = env.EBAY_WEBHOOK_SECRET || env.EBAY_NOTIFICATION_SECRET;
  if (!secret) {
    console.error('[ebayWebhook] Missing EBAY_WEBHOOK_SECRET / EBAY_NOTIFICATION_SECRET for challenge');
    return err('Server misconfiguration: missing webhook secret', 500);
  }

  const endpointUrl = `${url.origin}${url.pathname}`;
  const challengeResponse = await buildChallengeResponse(challengeCode, secret, endpointUrl);

  return ok({ challengeResponse });
}

/**
 * POST /api/ebay/webhook
 * Receives and cryptographically validates eBay notification events.
 *
 * Security:
 *   Extracts the signature header.
 *   Computes expected HMAC-SHA256 signature using raw body and EBAY_WEBHOOK_SECRET.
 *   Returns 401 Unauthorized for missing or invalid signatures.
 */
export async function onRequestPost(context) {
  const { request, env, ctx } = context;

  // 1. Verify configured secret in environment
  const secret = env?.EBAY_WEBHOOK_SECRET || env?.EBAY_NOTIFICATION_SECRET;
  if (!secret) {
    console.error('[ebayWebhook] Webhook secret not configured in environment');
    return err('Server misconfiguration: missing webhook secret', 500);
  }

  // 2. Extract signature header
  const signature = getSignatureHeader(request);
  if (!signature) {
    console.warn('[ebayWebhook] Missing signature header on incoming webhook');
    return err('Unauthorized: missing webhook signature header', 401);
  }

  // 3. Read raw body BEFORE any parsing (signature covers raw payload bytes)
  const rawBody = await request.arrayBuffer();

  // 4. Validate cryptographic signature
  const isValid = await verifyWebhookSignature(rawBody, signature, secret);
  if (!isValid) {
    console.warn('[ebayWebhook] Cryptographic signature validation failed - rejecting with 401');
    return err('Unauthorized: invalid webhook signature', 401);
  }

  // 5. Parse JSON payload
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch (_) {
    return err('Bad Request: invalid JSON payload', 400);
  }

  const eventType = (
    payload.metadata?.topic ||
    payload.eventType ||
    payload.topic ||
    'UNKNOWN'
  ).toUpperCase().replace(/\./g, '_');

  const ebayItemId = payload.notification?.data?.itemId || payload.ItemID || null;
  const ebayOrderId = payload.notification?.data?.orderId || payload.OrderID || null;
  const eventId = crypto.randomUUID();

  // 6. Log event to D1 immediately (if DB bound)
  if (env?.DB) {
    try {
      await env.DB.prepare(`
        INSERT INTO ebay_webhook_events (id, event_type, ebay_item_id, ebay_order_id, raw_payload)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        eventId,
        eventType,
        ebayItemId,
        ebayOrderId,
        JSON.stringify(payload).slice(0, 65535)
      ).run();
    } catch (e) {
      console.error('[ebayWebhook] failed to log event to D1:', e.message);
    }
  }

  // 7. Dispatch event processing asynchronously (non-blocking for SLA)
  const dispatchPromise = dispatchWebhookEvent(eventType, payload.notification?.data || payload, eventId, env);
  if (ctx?.waitUntil) {
    ctx.waitUntil(dispatchPromise);
  } else {
    // If running in environment without ctx.waitUntil (e.g. tests), await completion
    await dispatchPromise;
  }

  // 8. Return 200 OK within eBay SLA
  return ok({ success: true, eventId, eventType });
}
