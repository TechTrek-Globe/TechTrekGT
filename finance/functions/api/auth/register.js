import {
  hashPassword, verifyPassword, readJson, asTrimmedString,
  json, fail, issueSession, sessionCookies, withCookies,
  validatePassword, EMAIL_REGEX, randomInt, hmacHex, sendVerificationEmail,
  verifyTurnstile, ERROR_CODES, emitMetric, toPublicUser,
  MAX_BODY_AUTH, MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_ANSWER_LEN, MAX_QUESTION_LEN
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env, requestId } = context;

  const limited = await enforceRateLimit(context, 'register', 5, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid request body.', requestId);

    // Turnstile bot verification (cross-reference: CSP challenges.cloudflare.com)
    // Runs before account rate limiting, DB lookups, or password hashing.
    const turnstileToken = body.turnstileToken || body['cf-turnstile-response'];
    const ip = request.headers?.get('CF-Connecting-IP');
    const turnstileCheck = await verifyTurnstile(turnstileToken, env, ip, requestId);
    if (!turnstileCheck.success) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Security verification failed. Please try again.', requestId);
    }

    const rawName = asTrimmedString(body.name, MAX_NAME_LEN);
    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const { password, securityQuestion, securityAnswer } = body;

    if (!rawName || !rawEmail || typeof password !== 'string' || !securityQuestion || !securityAnswer) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Name, email, password, security question, and security answer are required.', requestId);
    }

    const cleanEmail = rawEmail.toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid email address format.', requestId);

    const accountLimited = await enforceRateLimit(context, 'register-account', 5, 300, cleanEmail);
    if (accountLimited) return accountLimited;

    const pwError = validatePassword(password);
    if (pwError) return fail(ERROR_CODES.VALIDATION_ERROR, 400, pwError, requestId);

    const cleanQuestion = asTrimmedString(securityQuestion, MAX_QUESTION_LEN);
    const cleanAnswer = asTrimmedString(securityAnswer, MAX_ANSWER_LEN);
    if (!cleanQuestion) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Security question is required.', requestId);
    if (!cleanAnswer) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Security answer is required.', requestId);

    if (!env.DB || !env.JWT_SECRET || !env.CODE_HMAC_SECRET) {
      console.error('[register] missing DB, JWT_SECRET, or CODE_HMAC_SECRET binding', requestId ? { requestId } : '');
      return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable. Please try again later.', requestId);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (existing) {
      emitMetric('auth.register.duplicate', requestId);
      // Neutral message: does not confirm whether the account exists. (H7)
      return fail(ERROR_CODES.CONFLICT, 409, 'That email address cannot be registered.', requestId);
    }

    const userId = `usr-${crypto.randomUUID()}`;

    const [passwordHash, securityAnswerHash] = await Promise.all([
      hashPassword(password),
      hashPassword(cleanAnswer.toLowerCase())
    ]);

    await env.DB.prepare(
      // created_at, status, and email_verified are written explicitly so this INSERT is not
      // fragile against DDL default removal. (Stage 1.1 / 1.2 / 5.2)
      'INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version, status, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(userId, cleanEmail, passwordHash, rawName, cleanQuestion, securityAnswerHash, 'user', 0, 'Active', 0, new Date().toISOString()).run();

    let verificationCode = '';
    for (let i = 0; i < 8; i++) verificationCode += String(randomInt(10));
    const codeHash = await hmacHex(env.CODE_HMAC_SECRET, `verify:${cleanEmail}:${verificationCode}`);
    const verificationId = `vfy-${crypto.randomUUID()}`;
    const now = Date.now();
    const VERIFY_CODE_TTL_MS = 24 * 60 * 60 * 1000;

    await env.DB.prepare(
      'INSERT INTO email_verifications (id, user_id, email, token, expires_at, used, attempts, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
    ).bind(verificationId, userId, cleanEmail, codeHash, now + VERIFY_CODE_TTL_MS, now).run();

    await sendVerificationEmail(env, cleanEmail, verificationCode, 'register').catch(() => {});

    const createdUser = {
      id: userId,
      email: cleanEmail,
      name: rawName,
      role: 'user',
      token_version: 0,
      email_verified: 0,
      security_question: cleanQuestion,
      security_answer_hash: securityAnswerHash
    };
    const { token, csrf, maxAge } = await issueSession(env, createdUser, { rememberMe: Boolean(body.rememberMe) });
    // csrf2 removed: issueSession already returns csrf above. (Stage 1.4 regression fix)

    emitMetric('auth.register.success', requestId);

    return withCookies(
      json({ success: true, user: toPublicUser(createdUser), householdId: null, csrfToken: csrf }, 201),
      sessionCookies(token, csrf, maxAge)
    );

  } catch (err) {
    console.error('[register] handler error:', requestId ? { requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred. Please try again.', requestId);
  }
}
