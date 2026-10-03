import {
  authenticate, readJson, asTrimmedString, json, fail, withCookies, sessionCookies, newCsrfToken,
  createToken, hashPassword, verifyPassword, validatePassword, issueOneTimeCode, ONE_TIME_CODE_TTL_MS,
  sendVerificationEmail, sendEmailChangeNotification, ERROR_CODES, toPublicUser,
  EMAIL_REGEX, MAX_BODY_AUTH, MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_QUESTION_LEN, MAX_ANSWER_LEN,
  ACCESS_TOKEN_TTL, SESSION_TTL_DEFAULT, invalidateCachedUser
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  let issuedVerificationId = null;
  const limited = await enforceRateLimit(context, 'profile', 20, 60);
  if (limited) return limited;

  try {
    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[update-profile] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.');
    }

    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const { payload, user } = auth;

    // Fetch credentials directly from D1 to keep them out of session cache (REM-13/REM-17)
    const dbCreds = await env.DB.prepare(
      'SELECT password_hash, security_answer_hash, security_question FROM users WHERE id = ?'
    ).bind(user.id).first();
    if (!dbCreds) return fail(ERROR_CODES.UNAUTHORIZED, 401, 'User not found.');

    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.');

    const { currentPassword, newPassword } = body;

    let updatedName = user.name;
    let pendingEmail = user.pending_email || null;
    let emailChangeRequested = false;
    let updatedQuestion = dbCreds.security_question;
    let updatedAnswerHash = dbCreds.security_answer_hash;
    let updatedPasswordHash = dbCreds.password_hash;
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
        if (!currentPassword || !(await verifyPassword(String(currentPassword), dbCreds.password_hash))) {
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
      if (!currentPassword || !(await verifyPassword(String(currentPassword), dbCreds.password_hash))) {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Current password is required to change your security question.');
      }
      updatedQuestion = securityQuestion;
      updatedAnswerHash = await hashPassword(securityAnswer.toLowerCase());
    }

    if (typeof newPassword === 'string' && newPassword.length > 0) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Current password is required to set a new password.');
      }
      if (!(await verifyPassword(currentPassword, dbCreds.password_hash))) {
        return fail(ERROR_CODES.INVALID_CREDENTIALS, 400, 'Current password is incorrect.');
      }
      const pwError = validatePassword(newPassword);
      if (pwError) return fail(ERROR_CODES.VALIDATION_ERROR, 400, pwError);
      updatedPasswordHash = await hashPassword(newPassword);
      bumpTokenVersion = true;
    }

    const newTokenVersion = Number(user.token_version || 0) + (bumpTokenVersion ? 1 : 0);

    if (emailChangeRequested && pendingEmail) {
      const { code: changeCode, verificationId } = await issueOneTimeCode(env, {
        table: 'email_verifications',
        userId: user.id,
        email: pendingEmail,
        purpose: 'verify',
        ttlMs: ONE_TIME_CODE_TTL_MS
      });
      issuedVerificationId = verificationId;

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

    await invalidateCachedUser(user.id, env);

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
        user: toPublicUser(user, {
          name: updatedName,
          pendingEmail: pendingEmail || null,
          securityQuestion: updatedQuestion,
          hasSecurityQuestion: Boolean(updatedQuestion && updatedAnswerHash)
        }),
        csrfToken: csrf
      }),
      sessionCookies(token, csrf, sexp - now)
    );
  } catch (err) {
    if (issuedVerificationId && env?.DB) {
      try {
        await env.DB.prepare('DELETE FROM email_verifications WHERE id = ?').bind(issuedVerificationId).run().catch(() => {});
      } catch (cleanupErr) {
        console.error('[update-profile] compensating cleanup error:', cleanupErr && cleanupErr.message);
      }
    }
    console.error('[update-profile] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.');
  }
}
