/**
 * ebayWebhook.js - eBay Notification Service Webhook handler
 *
 * Routes:
 *   GET  /api/ebay/webhook  - eBay challenge handshake (unauthenticated)
 *   POST /api/ebay/webhook  - Receive + validate signed notification events
 *
 * Security: HMAC-SHA256 signature validation on every POST.
 * eBay SLA: Must return 200 within 3 seconds; all D1 writes via ctx.waitUntil.
 *
 * Required env secrets: EBAY_NOTIFICATION_SECRET
 * Required bindings: DB
 *
 * Events dispatched:
 *   ITEM_SOLD                   -> auction_items.status = 'delist_pending'
 *   ORDER_PAYMENT_STATUS (PAID) -> status = 'Sold', draft auction_sales INSERT
 *   MARKETPLACE_ACCOUNT_DELETION -> DELETE ebay_oauth_tokens (GDPR compliance, mandatory)
 */

function base64ToArrayBuffer(b64) {
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

async function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Validates the HMAC-SHA256 signature on the raw request body.
 * Returns true if valid, false if invalid or missing.
 */
async function validateHmac(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  try {
    const rawBytes = rawBody instanceof ArrayBuffer ? new Uint8Array(rawBody) : rawBody;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );

    let candidate = signatureHeader.trim();
    if (candidate.toLowerCase().startsWith('sha256=')) {
      candidate = candidate.slice(7).trim();
    }

    const expectedSigBuf = await crypto.subtle.sign('HMAC', key, rawBytes);
    const expectedHex = await bufToHex(expectedSigBuf);
    const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSigBuf)));

    if (candidate.length === expectedHex.length && timingSafeEqual(candidate.toLowerCase(), expectedHex.toLowerCase())) {
      return true;
    }
    if (candidate.length === expectedB64.length && timingSafeEqual(candidate, expectedB64)) {
      return true;
    }

    try {
      const sigBuf = base64ToArrayBuffer(candidate);
      if (sigBuf.byteLength === 32) {
        const verified = await crypto.subtle.verify('HMAC', key, sigBuf, rawBytes);
        if (verified) return true;
      }
    } catch (_) {}

    return false;
  } catch (_) {
    return false;
  }
}

/**
 * Computes the eBay challenge response:
 * SHA-256(challengeCode + notificationSecret + endpointUrl)
 * formatted as a lowercase hex string, returned in JSON.
 */
async function buildChallengeResponse(challengeCode, secret, endpointUrl) {
  const payload = challengeCode + secret + endpointUrl;
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return bufToHex(hashBuf);
}

/**
 * Dispatches a validated webhook event to the appropriate D1 write.
 * Called via ctx.waitUntil - non-blocking relative to the HTTP response.
 */
async function dispatchWebhookEvent(eventType, payload, eventId, env) {
  const now = new Date().toISOString();

  try {
    if (eventType === 'MARKETPLACE_ACCOUNT_DELETION') {
      // GDPR mandatory: delete user OAuth tokens by eBay userId
      const ebayUserId = payload.userId || payload.UserId || payload.user?.userId;
      if (ebayUserId && env.DB) {
        await env.DB.prepare(
          'DELETE FROM ebay_oauth_tokens WHERE ebay_user_id = ?'
        ).bind(String(ebayUserId)).run();
      }
      await env.DB.prepare(
        `UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?`
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

    if (eventType === 'ITEM_SOLD' && ebayItemId && env.DB) {
      // Set item to delist_pending - seller must de-list from other platforms
      await env.DB.prepare(`
        UPDATE auction_items SET
          status = 'delist_pending',
          updated_at = datetime('now')
        WHERE ebay_listing_id = ?
          AND status IN ('Listed', 'Available')
      `).bind(String(ebayItemId)).run();

      await env.DB.prepare(
        `UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?`
      ).bind(now, eventId).run();
      return;
    }

    if (eventType === 'ORDER_PAYMENT_STATUS' && env.DB) {
      const paymentStatus = (
        payload.PaymentStatus || payload.paymentStatus ||
        payload.notification?.data?.paymentStatus || ''
      ).toUpperCase();

      if (paymentStatus === 'PAID' && ebayItemId) {
        // Fetch the internal item by ebay_listing_id
        const item = await env.DB.prepare(
          `SELECT * FROM auction_items WHERE ebay_listing_id = ? AND status = 'delist_pending'`
        ).bind(String(ebayItemId)).first();

        if (item) {
          const saleDate = new Date().toISOString().split('T')[0];
          const grossPrice = parseFloat(
            payload.Price || payload.price || payload.notification?.data?.amount || 0
          );

          // Transition to Sold
          await env.DB.prepare(`
            UPDATE auction_items SET
              status = 'Sold',
              actual_sell_price = ?,
              date_sold = ?,
              updated_at = datetime('now')
            WHERE id = ?
          `).bind(grossPrice || null, saleDate, item.id).run();

          // Check for existing sale row (avoid duplicates from manual log + webhook)
          const existing = await env.DB.prepare(
            'SELECT id FROM auction_sales WHERE item_id = ? AND user_id = ?'
          ).bind(item.id, item.user_id).first();

          if (!existing && grossPrice > 0) {
            const saleId = `sale-${crypto.randomUUID()}`;
            const feePct = item.platform_fee_pct || 0.135;
            const flatFee = item.platform_flat_fee || 0.30;
            const platformFees = grossPrice * feePct + flatFee;
            const netProceeds = grossPrice - platformFees;
            const netProfit = netProceeds - (item.true_total_cost || 0);

            await env.DB.prepare(`
              INSERT INTO auction_sales (
                id, user_id, item_id, sale_date, platform,
                gross_sale_price, platform_fee_pct, platform_flat_fee, platform_fees_amt,
                net_proceeds, true_total_cost, net_profit, roi_pct,
                days_to_sell, ebay_order_id
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            `).bind(
              saleId, item.user_id, item.id, saleDate, item.platform || 'eBay',
              grossPrice, feePct, flatFee, platformFees,
              netProceeds, item.true_total_cost || 0, netProfit,
              item.true_total_cost > 0 ? netProfit / item.true_total_cost : 0,
              ebayOrderId || null
            ).run();
          } else if (existing && ebayOrderId) {
            // Patch existing sale with the eBay order ID if webhook arrived after manual log
            await env.DB.prepare(
              'UPDATE auction_sales SET ebay_order_id = ? WHERE id = ? AND ebay_order_id IS NULL'
            ).bind(ebayOrderId, existing.id).run();
          }
        }
      }

      await env.DB.prepare(
        `UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?`
      ).bind(now, eventId).run();
      return;
    }

    // Unhandled event type - mark as processed (no action needed)
    await env.DB.prepare(
      `UPDATE ebay_webhook_events SET processed = 1, processed_at = ? WHERE id = ?`
    ).bind(now, eventId).run();

  } catch (e) {
    console.error(`[ebayWebhook] dispatch error for event ${eventId}:`, e.message);
    if (env.DB) {
      await env.DB.prepare(
        `UPDATE ebay_webhook_events SET processed = 2, error_message = ? WHERE id = ?`
      ).bind(e.message.slice(0, 500), eventId).run().catch(() => {});
    }
  }
}

// --- Route Handlers ---

/**
 * GET /api/ebay/webhook
 * eBay challenge handshake - unauthenticated, called by eBay at endpoint registration.
 */
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const challengeCode = url.searchParams.get('challenge_code');

  if (!challengeCode) {
    return new Response(
      JSON.stringify({ status: 'webhook endpoint active' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const secret = env.EBAY_WEBHOOK_SECRET || env.EBAY_NOTIFICATION_SECRET;
  const endpointUrl = `${url.origin}/api/ebay/webhook`;

  if (!secret) {
    return new Response('Server misconfiguration: missing webhook secret', { status: 500 });
  }

  const challengeResponse = await buildChallengeResponse(challengeCode, secret, endpointUrl);
  return new Response(
    JSON.stringify({ challengeResponse }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * POST /api/ebay/webhook
 * Receives eBay notification events. Validates HMAC signature, logs to D1, dispatches async.
 */
export async function onRequestPost(context) {
  const { request, env, ctx } = context;

  // Read raw body BEFORE any parsing - signature covers the raw bytes
  const rawBody = await request.arrayBuffer();
  const signature = (
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
  const secret = env.EBAY_WEBHOOK_SECRET || env.EBAY_NOTIFICATION_SECRET || '';

  if (!signature) {
    console.warn('[ebayWebhook] Missing signature header on incoming notification');
    return new Response('Unauthorized: missing signature header', { status: 401 });
  }

  const isValid = await validateHmac(rawBody, signature, secret);
  if (!isValid) {
    console.warn('[ebayWebhook] HMAC validation failed - rejecting notification');
    return new Response('Unauthorized: invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody));
  } catch (_) {
    return new Response('Bad Request: invalid JSON', { status: 400 });
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

  // Log event to D1 immediately (non-blocking return to eBay)
  if (env.DB) {
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
      console.error('[ebayWebhook] failed to log event:', e.message);
    }
  }

  // Dispatch processing in background - does not block the HTTP response
  if (ctx?.waitUntil) {
    ctx.waitUntil(dispatchWebhookEvent(eventType, payload.notification?.data || payload, eventId, env));
  }

  // Respond to eBay within SLA
  return new Response('', { status: 200 });
}
