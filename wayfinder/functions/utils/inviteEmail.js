// Invitation email dispatch via Cloudflare SEND_EMAIL binding (aligned with Outpost / no-reply@techtrekgt.com).
// Returns { sent: boolean, error?: string }. Never throws into the caller.

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function b64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

export async function sendInviteEmail(env, { to, inviterName, agendaTitle, role, link, expiresAt }) {
  if (!env?.SEND_EMAIL || typeof env.SEND_EMAIL.send !== 'function') {
    return { sent: false, error: 'SEND_EMAIL binding not configured' };
  }

  // Canonical sender address matching platform standard (Outpost & Cloudflare Email Routing)
  const sender = env.MAIL_FROM || 'no-reply@techtrekgt.com';
  const subject = `${inviterName} invited you to "${agendaTitle}" on Wayfinder`;
  const text = [
    `${inviterName} invited you to collaborate on "${agendaTitle}" as ${role}.`,
    '',
    `Accept the invitation: ${link}`,
    '',
    `This link expires on ${expiresAt}.`,
    '',
    'If you did not expect this invitation, you can safely ignore this email.'
  ].join('\n');

  const html = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">`,
    `<h2 style="color: #0f172a; margin-top: 0;">Wayfinder Travel Collaboration</h2>`,
    `<p style="font-size: 15px; line-height: 1.6;"><b>${esc(inviterName)}</b> has invited you to collaborate on <b>${esc(agendaTitle)}</b> as a <b>${esc(role)}</b>.</p>`,
    `<p style="margin: 28px 0;">`,
    `<a href="${esc(link)}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>`,
    `</p>`,
    `<p style="font-size: 13px; color: #64748b; line-height: 1.5;">Or copy and paste this link into your browser:<br/><a href="${esc(link)}" style="color: #0284c7; word-break: break-all;">${esc(link)}</a></p>`,
    `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`,
    `<p style="font-size: 12px; color: #94a3b8;">This single-use invitation expires on ${esc(expiresAt)}. Sent by TechTrek Wayfinder.</p>`,
    `</div>`
  ].join('\n');

  // Strategy 1: Cloudflare Workers structured send_email (Standard Outpost pattern)
  try {
    await env.SEND_EMAIL.send({
      to,
      from: sender,
      subject,
      text,
      html
    });
    return { sent: true };
  } catch (err1) {
    console.warn('[invite-email] Structured send failed:', err1?.message);

    // Strategy 2: Raw EmailMessage envelope fallback
    try {
      const { EmailMessage } = await import('cloudflare:email');
      const boundary = `wf-${crypto.randomUUID()}`;
      const raw = [
        `From: Wayfinder <${sender}>`,
        `To: ${to}`,
        `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
        `Message-ID: <${crypto.randomUUID()}@techtrekgt.com>`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(text),
        `--${boundary}`,
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        '',
        b64(html),
        `--${boundary}--`,
        '',
      ].join('\r\n');
      await env.SEND_EMAIL.send(new EmailMessage(sender, to, raw));
      return { sent: true };
    } catch (err2) {
      console.warn('[invite-email] EmailMessage fallback failed:', err2?.message);

      // Strategy 3: Resend API fallback if configured
      if (env?.RESEND_API_KEY) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: sender,
              to: [to],
              subject,
              text,
              html
            })
          });
          if (res.ok) return { sent: true };
        } catch (err3) {
          console.warn('[invite-email] Resend fallback failed:', err3?.message);
        }
      }

      return { sent: false, error: err1?.message || err2?.message || 'Email dispatch failed' };
    }
  }
}
