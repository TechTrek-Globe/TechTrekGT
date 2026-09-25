import {
  hashPassword, verifyPassword, readJson, asTrimmedString,
  json, fail, issueSession, sessionCookies, withCookies,
  validatePassword, EMAIL_REGEX,
  MAX_BODY_AUTH, MAX_NAME_LEN, MAX_EMAIL_LEN, MAX_ANSWER_LEN, MAX_QUESTION_LEN
} from '../../utils/auth.js';
import { enforceRateLimit } from '../../utils/rateLimit.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const limited = await enforceRateLimit(context, 'register', 5, 60);
  if (limited) return limited;

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    if (!body) return fail(400, 'Invalid request body.');

    const rawName = asTrimmedString(body.name, MAX_NAME_LEN);
    const rawEmail = asTrimmedString(body.email, MAX_EMAIL_LEN);
    const { password, securityQuestion, securityAnswer } = body;

    if (!rawName || !rawEmail || typeof password !== 'string' || !securityQuestion || !securityAnswer) {
      return fail(400, 'Name, email, password, security question, and security answer are required.');
    }

    const cleanEmail = rawEmail.toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) return fail(400, 'Invalid email address format.');

    const pwError = validatePassword(password);
    if (pwError) return fail(400, pwError);

    const cleanQuestion = asTrimmedString(securityQuestion, MAX_QUESTION_LEN);
    const cleanAnswer = asTrimmedString(securityAnswer, MAX_ANSWER_LEN);
    if (!cleanQuestion) return fail(400, 'Security question is required.');
    if (!cleanAnswer) return fail(400, 'Security answer is required.');

    if (!env.DB || !env.JWT_SECRET) {
      console.error('[register] missing DB or JWT_SECRET binding');
      return fail(503, 'Service unavailable. Please try again later.');
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
    if (existing) {
      // Neutral message: does not confirm whether the account exists. (H7)
      return fail(409, 'That email address cannot be registered.');
    }

    const userId = `usr-${crypto.randomUUID()}`;
    const householdId = `hh-${crypto.randomUUID()}`;
    const memberId = `hm-${crypto.randomUUID()}`;
    const person1Id = `person-${crypto.randomUUID()}`;

    const [passwordHash, securityAnswerHash] = await Promise.all([
      hashPassword(password),
      hashPassword(cleanAnswer.toLowerCase())
    ]);

    await env.DB.batch([
      env.DB.prepare(
        // created_at and status are written explicitly so this INSERT is not
        // fragile against DDL default removal. (Stage 1.1 / 1.2 regression fix)
        'INSERT INTO users (id, email, password_hash, name, security_question, security_answer_hash, role, token_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(userId, cleanEmail, passwordHash, rawName, cleanQuestion, securityAnswerHash, 'user', 0, 'Active', new Date().toISOString()),
      env.DB.prepare('INSERT INTO households (id, name) VALUES (?, ?)').bind(householdId, `${rawName}'s Household`),
      env.DB.prepare('INSERT INTO household_members (id, household_id, user_id, role) VALUES (?, ?, ?, ?)').bind(memberId, householdId, userId, 'owner'),
      env.DB.prepare(
        'INSERT INTO people (id, household_id, name, role, pay_frequency, pay_day1, pay_day2, gross_per_pay, net_per_pay, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(person1Id, householdId, rawName, 'Primary', 'bi-weekly', '15', 'last', 0, 0, 'purple')
    ]);

    const newUser = { id: userId, email: cleanEmail, name: rawName, token_version: 0 };
    const { token, csrf, maxAge } = await issueSession(env, newUser, householdId, Boolean(body.rememberMe));
    // csrf2 removed: issueSession already returns csrf above. (Stage 1.4 regression fix)

    return withCookies(
      json({ success: true, user: { id: userId, email: cleanEmail, name: rawName }, householdId, csrfToken: csrf }, 201),
      sessionCookies(token, csrf, maxAge)
    );

  } catch (err) {
    console.error('[register] handler error:', err && err.message);
    return fail(500, 'An internal error occurred. Please try again.');
  }
}
