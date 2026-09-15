import { verifyToken, getTokenFromRequest } from '../../utils/auth.js';

function requireAuth(request, env) {
  const token = getTokenFromRequest(request);
  return token ? verifyToken(token, env.JWT_SECRET) : Promise.resolve(null);
}

// GET /api/vinescout/tax - read tax settings for current user
export async function onRequestGet(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const row = await env.DB.prepare(
      'SELECT * FROM vine_tax_settings WHERE user_id = ?'
    ).bind(payload.userId).first();

    return new Response(JSON.stringify({ success: true, settings: row || null }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('[vinescout tax GET] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}

// PUT /api/vinescout/tax - upsert tax settings for current user
export async function onRequestPut(context) {
  const { request, env } = context;
  const payload = await requireAuth(request, env);
  if (!payload) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json();
    const now  = new Date().toISOString();

    await env.DB.prepare(`
      INSERT INTO vine_tax_settings (
        user_id, filing_status, state_code, state_tax_type, state_tax_rate,
        se_deduction_pct, se_tax_rate, use_qbi_deduction, custom_brackets_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        filing_status        = excluded.filing_status,
        state_code           = excluded.state_code,
        state_tax_type       = excluded.state_tax_type,
        state_tax_rate       = excluded.state_tax_rate,
        se_deduction_pct     = excluded.se_deduction_pct,
        se_tax_rate          = excluded.se_tax_rate,
        use_qbi_deduction    = excluded.use_qbi_deduction,
        custom_brackets_json = excluded.custom_brackets_json,
        updated_at           = excluded.updated_at
    `).bind(
      payload.userId,
      String(body.filing_status || 'single'),
      body.state_code || null,
      body.state_tax_type || null,
      body.state_tax_rate !== undefined ? parseFloat(body.state_tax_rate) : null,
      parseFloat(body.se_deduction_pct) || 0.5,
      parseFloat(body.se_tax_rate) || 0.153,
      body.use_qbi_deduction !== undefined ? (body.use_qbi_deduction ? 1 : 0) : 1,
      body.custom_brackets_json ? JSON.stringify(body.custom_brackets_json) : null,
      now
    ).run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('[vinescout tax PUT] error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
