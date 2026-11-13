// Invitation email dispatch for Finance OS via Cloudflare SEND_EMAIL binding & Resend fallback
// Canonical sender: noreply@techtrekgt.com
// Returns { sent: boolean, error?: string }. Never throws into caller.

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function b64(text) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  }
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/(.{76})/g, '$1\r\n');
}

function encodeSubject(subject) {
  if (typeof Buffer !== 'undefined') {
    return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
  }
  const bytes = new TextEncoder().encode(subject);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export async function dispatchEmail(env, { sender, to, subject, text, html }) {
  // Strategy 1: Cloudflare Workers EmailMessage with raw MIME
  if (env?.SEND_EMAIL && typeof env.SEND_EMAIL.send === 'function') {
    try {
      const emailModule = 'cloudflare:email';
      const { EmailMessage } = await import(/* @vite-ignore */ emailModule);
      const boundary = `finance_${crypto.randomUUID().replace(/-/g, '')}`;
      const rawMime = [
        `From: TechTrek Finance OS <${sender}>`,
        `To: ${to}`,
        `Subject: ${encodeSubject(subject)}`,
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
        ''
      ].join('\r\n');

      await env.SEND_EMAIL.send(new EmailMessage(sender, to, rawMime));
      console.log(`[email] Successfully sent invite email to ${to} via EmailMessage`);
      return { sent: true };
    } catch (err1) {
      console.warn('[email] EmailMessage dispatch error:', err1?.message);

      // Strategy 2: Cloudflare structured send
      try {
        await env.SEND_EMAIL.send({
          to,
          from: sender,
          subject,
          text,
          html
        });
        console.log(`[email] Successfully sent invite email to ${to} via structured send`);
        return { sent: true };
      } catch (err2) {
        console.warn('[email] Structured send error:', err2?.message);

        // Strategy 3: Object array format
        try {
          await env.SEND_EMAIL.send({
            to: [{ email: to, name: to.split('@')[0] }],
            from: { email: sender, name: 'TechTrek Finance OS' },
            subject,
            text,
            html
          });
          console.log(`[email] Successfully sent invite email to ${to} via object send`);
          return { sent: true };
        } catch (err3) {
          console.warn('[email] Object send error:', err3?.message);
        }
      }
    }
  }

  // Strategy 4: External Resend API fallback if RESEND_API_KEY is configured
  if (env?.RESEND_API_KEY) {
    const postToResend = async (fromAddr) => {
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [to],
          subject,
          text,
          html
        }),
        signal: AbortSignal.timeout(8000)
      });
    };

    try {
      let res = await postToResend(`TechTrek Finance OS <${sender}>`);
      if (res.ok) {
        console.log(`[email] Successfully sent email to ${to} via Resend`);
        return { sent: true };
      }
      const resData = await res.json().catch(() => ({}));
      console.warn('[email] Resend API rejected dispatch:', res.status, resData);

      // If domain not yet verified in Resend, retry with onboarding sandbox sender
      if (res.status === 403 && String(resData?.message || '').toLowerCase().includes('domain is not verified')) {
        console.log('[email] Retrying Resend dispatch with onboarding@resend.dev sandbox sender...');
        const sandboxRes = await postToResend('TechTrek Finance OS <onboarding@resend.dev>');
        if (sandboxRes.ok) {
          console.log(`[email] Successfully sent email to ${to} via Resend sandbox`);
          return { sent: true };
        }
        const sandboxData = await sandboxRes.json().catch(() => ({}));
        console.warn('[email] Resend sandbox retry rejected:', sandboxRes.status, sandboxData);
      }
    } catch (err4) {
      console.warn('[email] Resend fallback error:', err4?.message);
    }
  }

  return {
    sent: false,
    error: 'Email delivery unavailable (SEND_EMAIL and RESEND_API_KEY unconfigured or rejected)'
  };
}

export async function sendInviteEmail(env, { to, inviterName, ledgerTitle, role, link, expiresAt }) {
  const sender = env?.MAIL_FROM || 'noreply@techtrekgt.com';
  const subject = `${inviterName} invited you to collaborate on "${ledgerTitle}" (Finance OS)`;
  const text = [
    `${inviterName} has invited you to collaborate on the budget ledger "${ledgerTitle}" with the role of ${role}.`,
    '',
    `Accept the invitation: ${link}`,
    '',
    `This invitation link expires on ${expiresAt}.`,
    '',
    'If you did not expect this invitation, you can safely ignore this email.'
  ].join('\n');

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">',
    '<h2 style="color: #0f172a; margin-top: 0; font-size: 20px;">TechTrek Finance OS Collaboration</h2>',
    `<p style="font-size: 15px; line-height: 1.6; color: #334155;"><b>${esc(inviterName)}</b> has invited you to collaborate on <b>${esc(ledgerTitle)}</b> as a <b>${esc(role)}</b>.</p>`,
    '<p style="margin: 28px 0;">',
    `<a href="${esc(link)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>`,
    '</p>',
    `<p style="font-size: 13px; color: #64748b; line-height: 1.5;">Or copy and paste this link into your browser:<br/><a href="${esc(link)}" style="color: #2563eb; word-break: break-all;">${esc(link)}</a></p>`,
    '<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />',
    `<p style="font-size: 12px; color: #94a3b8;">This single-use invitation expires on ${esc(expiresAt)}. Sent by TechTrek Finance OS.</p>`,
    '</div>'
  ].join('\n');

  return dispatchEmail(env, { sender, to, subject, text, html });
}
