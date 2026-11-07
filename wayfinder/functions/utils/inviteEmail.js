// Invitation and verification email dispatch via Cloudflare SEND_EMAIL binding
// Canonical sender: noreply@techtrekgt.com
// Returns { sent: boolean, error?: string }. Never throws into the caller.

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

async function dispatchEmail(env, { sender, to, subject, text, html }) {
  if (!env?.SEND_EMAIL || typeof env.SEND_EMAIL.send !== 'function') {
    console.warn('[email] SEND_EMAIL binding not configured on env');
    return { sent: false, error: 'SEND_EMAIL binding not configured' };
  }

  // Strategy 1: Cloudflare Workers EmailMessage with raw MIME (Native Cloudflare Email Worker standard)
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const boundary = `wf_${crypto.randomUUID().replace(/-/g, '')}`;
    const rawMime = [
      `From: TechTrek Wayfinder <${sender}>`,
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
      '',
    ].join('\r\n');

    await env.SEND_EMAIL.send(new EmailMessage(sender, to, rawMime));
    console.log(`[email] Successfully sent email to ${to} via EmailMessage`);
    return { sent: true };
  } catch (err1) {
    console.warn('[email] EmailMessage dispatch error:', err1?.message);

    // Strategy 2: High-level structured send_email format (newer Cloudflare runtime)
    try {
      await env.SEND_EMAIL.send({
        to,
        from: sender,
        subject,
        text,
        html
      });
      console.log(`[email] Successfully sent email to ${to} via structured send`);
      return { sent: true };
    } catch (err2) {
      console.warn('[email] Structured send error:', err2?.message);

      // Strategy 3: Object format with email/name structures
      try {
        await env.SEND_EMAIL.send({
          to: [{ email: to }],
          from: { email: sender, name: 'TechTrek Wayfinder' },
          subject,
          text,
          html
        });
        console.log(`[email] Successfully sent email to ${to} via structured object send`);
        return { sent: true };
      } catch (err3) {
        console.warn('[email] Object send error:', err3?.message);

        // Strategy 4: External Resend API fallback if configured
        if (env?.RESEND_API_KEY) {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: `TechTrek Wayfinder <${sender}>`,
                to: [to],
                subject,
                text,
                html
              })
            });
            if (res.ok) {
              console.log(`[email] Successfully sent email to ${to} via Resend`);
              return { sent: true };
            }
          } catch (err4) {
            console.warn('[email] Resend fallback error:', err4?.message);
          }
        }

        return {
          sent: false,
          error: err1?.message || err2?.message || err3?.message || 'Email delivery failed'
        };
      }
    }
  }
}

export async function sendInviteEmail(env, { to, inviterName, agendaTitle, role, link, expiresAt }) {
  const sender = env?.MAIL_FROM || 'noreply@techtrekgt.com';
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
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">`,
    `<h2 style="color: #0f172a; margin-top: 0;">Wayfinder Travel Collaboration</h2>`,
    `<p style="font-size: 15px; line-height: 1.6; color: #334155;"><b>${esc(inviterName)}</b> has invited you to collaborate on <b>${esc(agendaTitle)}</b> as a <b>${esc(role)}</b>.</p>`,
    `<p style="margin: 28px 0;">`,
    `<a href="${esc(link)}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>`,
    `</p>`,
    `<p style="font-size: 13px; color: #64748b; line-height: 1.5;">Or copy and paste this link into your browser:<br/><a href="${esc(link)}" style="color: #0284c7; word-break: break-all;">${esc(link)}</a></p>`,
    `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`,
    `<p style="font-size: 12px; color: #94a3b8;">This single-use invitation expires on ${esc(expiresAt)}. Sent by TechTrek Wayfinder.</p>`,
    `</div>`
  ].join('\n');

  return dispatchEmail(env, { sender, to, subject, text, html });
}

export async function sendVerificationCodeEmail(env, { to, code, name }) {
  const sender = env?.MAIL_FROM || 'noreply@techtrekgt.com';
  const subject = `Your TechTrek Verification Code: ${code}`;
  const greeting = name ? `Hello ${name},` : 'Hello,';
  const text = [
    greeting,
    '',
    'Thank you for registering with TechTrek Wayfinder.',
    '',
    `Your 8-digit verification code is: ${code}`,
    '',
    'Enter this code on the verification screen to verify your email address and activate your account.',
    'This code expires in 24 hours and can be used once.',
    '',
    'If you did not create an account, you can safely ignore this email.'
  ].join('\n');

  const html = [
    `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">`,
    `<h2 style="color: #0f172a; margin-top: 0;">Verify Your TechTrek Account</h2>`,
    `<p style="font-size: 15px; line-height: 1.6; color: #334155;">${greeting}</p>`,
    `<p style="font-size: 15px; line-height: 1.6; color: #334155;">Thank you for registering with TechTrek Wayfinder. Please use the verification code below to verify your email and complete your sign in:</p>`,
    `<div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px 24px; text-align: center; margin: 24px 0;">`,
    `<span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0284c7; font-family: 'Courier New', Courier, monospace;">${code}</span>`,
    `</div>`,
    `<p style="font-size: 13px; color: #64748b; line-height: 1.5;">This code will expire in 24 hours and can only be used once.</p>`,
    `<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />`,
    `<p style="font-size: 12px; color: #94a3b8;">If you did not request this verification code, no further action is needed. Sent by TechTrek Wayfinder.</p>`,
    `</div>`
  ].join('\n');

  return dispatchEmail(env, { sender, to, subject, text, html });
}
