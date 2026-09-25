import {
  authenticate, readJson, asTrimmedString, json, fail, withCookies, sessionCookies, newCsrfToken,
  createToken, hashPassword, verifyPassword, validatePassword, randomInt, hmacHex,
  sendVerificationEmail, sendEmailChangeNotification, ERROR_CODES,
  EMAIL_REGEX, MAX_BODY_AUTH, MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_QUESTION_LEN, MAX_ANSWER_LEN,
  ACCESS_TOKEN_TTL, SESSION_TTL_DEFAULT
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const limited = await enforceRateLimit(context, 'profile', 20, 60);
  if (limited) return limited;

  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.');

    const { currentPassword, newPassword } = body;

    let updatedName = user.name;
    let pendingEmail = user.pending_email || null;
    let emailChangeRequested = false;
    let updatedQuestion = user.security_question;
    let updatedAnswerHash = user.security_answer_hash;
    let updatedPasswordHash = user.password_hash;
    let bumpTokenVersion = false;

    const name = asTrimmedString(body.name, MAX_NAME_LEN);
    if (name) updatedName = name;

    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    if (rawEmail) {
      const cleanEmail = rawEmail.toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid email address format.');
      if (cleanEmail !== user.email) {
        // Changing the address that owns the account is a security-sensitive
        // action; require the current password.
        if (!currentPassword || !(await verifyPassword(String(currentPassword), user.password_hash))) {
          return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Current password is required to change your email address.');
        }
        const existing = await env.DB.prepare(
          'SELECT id FROM users WHERE email = ? AND id != ?'
        ).bind(cleanEmail, user.id).first();
        if (existing) return fail(ERROR_CODES.CONFLICT, 409, 'That email address cannot be used.');

        pendingEmail = cleanEmail;
        emailChangeRequested = true;
      }
    }

    const securityQuestion = asTrimmedString(body.securityQuestion, MAX_QUESTION_LEN);
    if (securityQuestion) {
      const securityAnswer = asTrimmedString(body.securityAnswer, MAX_ANSWER_LEN);
      if (!securityAnswer) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'A security answer is required when changing the security question.');
      }
      if (!currentPassword || !(await verifyPassword(String(currentPassword), user.password_hash))) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Current password is required to change your security question.');
      }
      updatedQuestion = securityQuestion;
      updatedAnswerHash = await hashPassword(securityAnswer.toLowerCase());
    }

    if (typeof newPassword === 'string' && newPassword.length > 0) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Current password is required to set a new password.');
      }
      if (!(await verifyPassword(currentPassword, user.password_hash))) {
        return fail(ERROR_CODES.INVALID_CREDENTIALS, 400, 'Current password is incorrect.');
      }
      const pwError = validatePassword(newPassword);
      if (pwError) return fail(ERROR_CODES.VALIDATION_ERROR, 400, pwError);
      updatedPasswordHash = await hashPassword(newPassword);
      bumpTokenVersion = true;
    }

    const newTokenVersion = Number(user.token_version || 0) + (bumpTokenVersion ? 1 : 0);

    if (emailChangeRequested && pendingEmail) {
      let changeCode = '';
      for (let i = 0; i < 8; i++) changeCode += String(randomInt(10));
      const codeHash = await hmacHex(env.JWT_SECRET, `verify:${pendingEmail}:${changeCode}`);
      const verificationId = `vfy-${crypto.randomUUID()}`;
      const nowMs = Date.now();
      const VERIFY_CODE_TTL_MS = 24 * 60 * 60 * 1000;

      await env.DB.batch([
        env.DB.prepare('UPDATE email_verifications SET used = 1 WHERE user_id = ? AND email = ? AND used = 0').bind(user.id, pendingEmail),
        env.DB.prepare(
          'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
        ).bind(verificationId, user.id, pendingEmail, codeHash, nowMs + VERIFY_CODE_TTL_MS, nowMs)
      ]);

      await sendVerificationEmail(env, pendingEmail, changeCode, 'change').catch(() => {});
      await sendEmailChangeNotification(env, user.email, pendingEmail).catch(() => {});
    }

    await env.DB.prepare(
      `UPDATE users
          SET name = ?, pending_email = ?, security_question = ?, security_answer_hash = ?, password_hash = ?, token_version = ?
        WHERE id = ?`
    ).bind(
      updatedName,
      pendingEmail,
      updatedQuestion,
      updatedAnswerHash,
      updatedPasswordHash,
      newTokenVersion,
      user.id
    ).run();

    // Re-issue within the existing session window rather than silently
    // extending the session (fix H6).
    const now = Math.floor(Date.now() / 1000);
    const sexp = typeof payload.sexp === 'number' && payload.sexp > now ? payload.sexp : now + SESSION_TTL_DEFAULT;
    const { token } = await createToken(
      {
        userId: user.id,
        email: user.email,
        name: updatedName,
        tv: newTokenVersion,
        sid: payload.sid || crypto.randomUUID()
      },
      env.JWT_SECRET,
      ACCESS_TOKEN_TTL,
      sexp
    );
    const csrf = newCsrfToken();

    return withCookies(
      json({
        success: true,
        message: emailChangeRequested
          ? 'Profile updated. A verification code has been sent to your new email address to confirm the change.'
          : 'Profile updated successfully.',
        user: {
          id: user.id,
          email: user.email,
          name: updatedName,
          isAdmin: user.role === 'admin',
          emailVerified: Boolean(user.email_verified),
          pendingEmail: pendingEmail || null,
          securityQuestion: updatedQuestion,
          hasSecurityQuestion: Boolean(updatedQuestion && updatedAnswerHash)
        },
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, sexp - now)
    );
  } catch (err) {
    console.error('[update-profile] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.');
  }
}
