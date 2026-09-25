import { onRequestPost as registerHandler } from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler } from '../functions/api/auth/login.js';
import { onRequestGet as meHandler } from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler } from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler } from '../functions/api/auth/reset-password.js';
import { onRequestGet as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler } from '../functions/api/auth/update-profile.js';
import { onRequestPost as verifyEmailHandler } from '../functions/api/auth/verify-email.js';
import { onRequestPost as resendVerificationHandler } from '../functions/api/auth/resend-verification.js';
import { onRequestPost as confirmEmailChangeHandler } from '../functions/api/auth/confirm-email-change.js';
import { onRequestPost as refreshHandler } from '../functions/api/auth/refresh.js';
import { onRequestGet as adminStatsHandler } from '../functions/api/admin/stats.js';
import { onRequestPost as adminUserStatusHandler } from '../functions/api/admin/user-status.js';
import {
  authenticate,
  readJson,
  json,
  fail,
  base64UrlEncodeBytes,
  constantTimeStringEqual,
  MAX_BODY_AUTH,
  MAX_BODY_SYNC,
  ERROR_CODES,
  emitMetric
} from '../functions/utils/auth.js';
import { enforceRateLimit } from '../functions/utils/rateLimit.js';

export { RateLimiter } from './RateLimiter.js';

/* ------------------------------------------------------------------ */
/* Allowed Origins & Security Configuration                            */
/* ------------------------------------------------------------------ */

export const ALLOWED_ORIGINS = [
  'https://techtrekgt.com',
  'http://techtrekgt.com',
  'https://techtrek-budget.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8787'
];

// Cloudflare Turnstile bot verification & Edge WAF challenges:
// challenges.cloudflare.com is allowlisted below across script-src, connect-src, img-src,
// frame-src, and child-src to permit Turnstile challenges and widgets.
// Server-side verification is executed on /api/auth/login and /api/auth/register
// via verifyTurnstile() in functions/utils/auth.js calling Cloudflare's siteverify API.
function buildCsp(nonce) {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // No 'unsafe-inline' for scripts. Nonce + strict-dynamic instead.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com`,
    "connect-src 'self' https://techtrekgt.com https://challenges.cloudflare.com",
    "img-src 'self' data: blob: https://challenges.cloudflare.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src 'self' https://challenges.cloudflare.com blob:",
    "child-src 'self' https://challenges.cloudflare.com blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "upgrade-insecure-requests"
  ].join('; ');
}

class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(el) {
    el.setAttribute('nonce', this.nonce);
  }
}

function addSecurityHeaders(response, options = {}) {
  const opts = typeof options === 'object' && options !== null ? options : { isLocalhost: Boolean(options) };
  const { isLocalhost = false, isProduction = false, requestOrigin = '', nonce = '', requestPath: rawRequestPath = '' } = opts;
  const rawPath = rawRequestPath || opts.path || opts.pathname || (opts.url ? new URL(opts.url, 'http://localhost').pathname : '') || (response.url ? new URL(response.url).pathname : '');
  const requestPath = rawPath ? rawPath.split('?')[0].split('#')[0] : '';
  const headers = new Headers(response.headers);

  if (isProduction && !isLocalhost) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    headers.set('Content-Security-Policy', buildCsp(nonce));
  }

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-XSS-Protection', '0');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');

  // Only emit CORS headers for origins on the allowlist, and always Vary on Origin
  headers.append('Vary', 'Origin');
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    headers.set('Access-Control-Allow-Origin', requestOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, X-Sync-Passcode');
    headers.set('Access-Control-Max-Age', '86400');
  }

  const contentType = headers.get('content-type') || '';
  const isHtml = contentType.includes('text/html');

  if (isHtml) {
    headers.set('Cache-Control', 'no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }
  if (contentType.includes('application/json')) {
    headers.set('Cache-Control', 'no-store');
  }

  const isStaticAsset =
    !isHtml &&
    !contentType.includes('application/json') &&
    (contentType.startsWith('application/javascript') ||
      contentType.startsWith('text/javascript') ||
      contentType.startsWith('text/css') ||
      contentType.startsWith('image/') ||
      contentType.startsWith('font/') ||
      contentType.startsWith('application/font') ||
      contentType.startsWith('application/wasm') ||
      requestPath.startsWith('/finance/assets/') ||
      requestPath.startsWith('/assets/') ||
      /\.(?:js|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|webmanifest|wasm)$/i.test(requestPath));

  if (isStaticAsset && (response.status < 400 || response.status === 304)) {
    // Check if filename is content-hashed (e.g., name-hash.ext, name.hash.ext, or assets under /finance/assets/)
    const isHashedAsset =
      /[-.][a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9]+$/i.test(requestPath) ||
      requestPath.startsWith('/finance/assets/') ||
      requestPath.startsWith('/assets/');

    if (isHashedAsset) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // TODO: Immutable caching requires content-hashed filenames to be safe against stale browser caches.
      headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    }
  }

  const rewritten = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  if (isHtml && nonce && response.body && typeof HTMLRewriter !== 'undefined') {
    return new HTMLRewriter().on('script', new NonceInjector(nonce)).transform(rewritten);
  }
  return rewritten;
}

/* ------------------------------------------------------------------ */
/* Sync Handlers (hardened)                                            */
/* ------------------------------------------------------------------ */

async function handleVerifySyncCode(context) {
  const { request, env } = context;

  // 1. IP rate limiting (5 attempts / 300s) & production binding check
  const ipLimited = await enforceRateLimit(context, 'sync-code', 5, 300);
  if (ipLimited) return ipLimited;

  // 2. Authenticated session & CSRF check (breaking change: requires valid session)
  const auth = await authenticate(context, { requireCsrf: true });
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  // 3. Per-account rate limiting (5 attempts / 300s keyed on auth.user.id) to throttle distributed brute force
  const userLimited = await enforceRateLimit(context, 'sync-code-account', 5, 300, userId);
  if (userLimited) return userLimited;

  // Fails closed when unconfigured. No "123456" fallback (fix C4).
  const secretCode = env?.SYNC_UNLOCK_CODE;
  if (!secretCode) {
    console.error('[verify-sync-code] SYNC_UNLOCK_CODE is not configured');
    return fail(ERROR_CODES.SERVICE_UNAVAILABLE, 503, 'Service unavailable.');
  }

  try {
    const body = await readJson(request, MAX_BODY_AUTH);
    const code = body && typeof body.code === 'string' ? body.code.trim() : '';
    if (!code || !(await constantTimeStringEqual(code, String(secretCode).trim()))) {
      return fail(ERROR_CODES.UNAUTHORIZED, 401, 'Invalid access passcode');
    }
    return json({ success: true, token: 'vault-unlocked' });
  } catch (err) {
    console.error('[verify-sync-code] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Verification failed');
  }
}

/* ------------------------------------------------------------------ */
/* Budget Payload Validation Schema & Limits                           */
/* ------------------------------------------------------------------ */

export const BUDGET_LIMITS = {
  MAX_ACCOUNTS: 200,
  MAX_PEOPLE: 100,
  MAX_BILLS: 1000,
  MAX_TRANSACTIONS: 25000,
  MAX_LINE_ITEMS: 10000,
  MAX_FUNDING_GOALS: 500,
  MAX_LOANS: 100,
  MAX_DASHBOARD_WIDGETS: 100,
  MAX_CATEGORIES: 500,
  MAX_DAILY_MATRIX_KEYS: 25000,

  MAX_ID_LEN: 128,
  MAX_NAME_LEN: 255,
  MAX_TEXT_LEN: 2000,
  MAX_SHORT_STR_LEN: 100
};

export const ALLOWED_BUDGET_KEYS = new Set([
  'accounts',
  'people',
  'bills',
  'transactions',
  'lineItems',
  'fundingGoals',
  'loans',
  'loan',
  'dailyMatrix',
  'dashboardWidgets',
  'theme',
  'hideDashboardHeader',
  'categories'
]);

function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function isStringUnder(val, maxLen) {
  return typeof val === 'string' && val.length <= maxLen;
}

function validateStringMap(map, maxKeyLen = BUDGET_LIMITS.MAX_ID_LEN) {
  if (!isObject(map)) return false;
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string' || k.length > maxKeyLen) return false;
    if (!isFiniteNumber(v)) return false;
  }
  return true;
}

/**
 * Validates incoming budget payload against explicit schema, type, and length constraints.
 * Rejects unknown top-level keys to prevent unauthorized or unexpected field injection.
 * Enforces collection count limits and per-field type and string length boundaries.
 *
 * @param {*} payload - The budget data object to validate
 * @returns {boolean} True if payload conforms to schema, false otherwise
 */
export function validateBudgetPayload(payload) {
  if (!isObject(payload)) {
    return false;
  }

  // Reject unknown top-level keys
  const keys = Object.keys(payload);
  for (const key of keys) {
    if (!ALLOWED_BUDGET_KEYS.has(key)) {
      return false;
    }
  }

  // 1. accounts
  if (payload.accounts !== undefined) {
    if (!Array.isArray(payload.accounts) || payload.accounts.length > BUDGET_LIMITS.MAX_ACCOUNTS) {
      return false;
    }
    for (const item of payload.accounts) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.type !== undefined && !isStringUnder(item.type, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.color !== undefined && !isStringUnder(item.color, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.notes !== undefined && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return false;
      if (item.startingBalance !== undefined && !isFiniteNumber(item.startingBalance)) return false;
      if (item.extraStartingBalance !== undefined && !isFiniteNumber(item.extraStartingBalance)) return false;
      if (item.saveExtraMonthly !== undefined && !isFiniteNumber(item.saveExtraMonthly)) return false;
      if (item.enableExtraSavings !== undefined && typeof item.enableExtraSavings !== 'boolean') return false;
      if (item.isArchived !== undefined && typeof item.isArchived !== 'boolean') return false;
      if (item.overflowSplits !== undefined && !validateStringMap(item.overflowSplits)) return false;
      if (item.saveExtraSplits !== undefined && !validateStringMap(item.saveExtraSplits)) return false;
      if (item.importedLedgerRows !== undefined && !isObject(item.importedLedgerRows)) return false;
    }
  }

  // 2. people
  if (payload.people !== undefined) {
    if (!Array.isArray(payload.people) || payload.people.length > BUDGET_LIMITS.MAX_PEOPLE) {
      return false;
    }
    for (const item of payload.people) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.role !== undefined && !isStringUnder(item.role, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.payFrequency !== undefined && !isStringUnder(item.payFrequency, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.color !== undefined && !isStringUnder(item.color, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.payDay1 !== undefined && !isStringUnder(item.payDay1, 50) && !isFiniteNumber(item.payDay1)) return false;
      if (item.payDay2 !== undefined && !isStringUnder(item.payDay2, 50) && !isFiniteNumber(item.payDay2)) return false;
      if (item.grossPerPay !== undefined && !isFiniteNumber(item.grossPerPay)) return false;
      if (item.netPerPay !== undefined && !isFiniteNumber(item.netPerPay)) return false;
      if (item.isArchived !== undefined && typeof item.isArchived !== 'boolean') return false;
      if (item.accountAllocations !== undefined && !validateStringMap(item.accountAllocations)) return false;
    }
  }

  // 3. bills
  if (payload.bills !== undefined) {
    if (!Array.isArray(payload.bills) || payload.bills.length > BUDGET_LIMITS.MAX_BILLS) {
      return false;
    }
    for (const item of payload.bills) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.accountId !== undefined && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return false;
      if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.amount !== undefined && !isFiniteNumber(item.amount)) return false;
      if (item.period !== undefined && !isStringUnder(item.period, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.dueDay !== undefined && !isStringUnder(item.dueDay, 50) && !isFiniteNumber(item.dueDay)) return false;
      if (item.paymentSource !== undefined && !isStringUnder(item.paymentSource, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.notes !== undefined && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return false;
      if (item.matchingKey !== undefined && !isStringUnder(item.matchingKey, 1000)) return false;
      if (item.bankMatchNames !== undefined && !isStringUnder(item.bankMatchNames, 1000)) return false;
      if (item.isArchived !== undefined && typeof item.isArchived !== 'boolean') return false;
      if (item.splits !== undefined && !validateStringMap(item.splits)) return false;
      if (item.months !== undefined) {
        if (!Array.isArray(item.months) || item.months.length > 12) return false;
        for (const m of item.months) {
          if (!isFiniteNumber(m)) return false;
        }
      }
    }
  }

  // 4. transactions
  if (payload.transactions !== undefined) {
    if (!Array.isArray(payload.transactions) || payload.transactions.length > BUDGET_LIMITS.MAX_TRANSACTIONS) {
      return false;
    }
    for (const item of payload.transactions) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.accountId !== undefined && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return false;
      if (item.date !== undefined && !isStringUnder(item.date, 50)) return false;
      if (item.amount !== undefined && !isFiniteNumber(item.amount)) return false;
      if (item.description !== undefined && !isStringUnder(item.description, 500)) return false;
      if (item.notes !== undefined && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return false;
      if (item.category !== undefined && !isStringUnder(item.category, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.personId !== undefined && !isStringUnder(item.personId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.personId)) return false;
      if (item.billId !== undefined && !isStringUnder(item.billId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.billId)) return false;
      if (item.isOther !== undefined && typeof item.isOther !== 'boolean') return false;
      if (item.type !== undefined && !isStringUnder(item.type, 50)) return false;
      if (item.status !== undefined && !isStringUnder(item.status, 50)) return false;
    }
  }

  // 5. lineItems
  if (payload.lineItems !== undefined) {
    if (!Array.isArray(payload.lineItems) || payload.lineItems.length > BUDGET_LIMITS.MAX_LINE_ITEMS) {
      return false;
    }
    for (const item of payload.lineItems) {
      if (!isObject(item)) return false;
      if (item.billId !== undefined && !isStringUnder(item.billId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.billId)) return false;
      if (item.monthKey !== undefined && !isStringUnder(item.monthKey, 50)) return false;
      if (item.actualAmount !== undefined && !isFiniteNumber(item.actualAmount)) return false;
      if (item.updatedAt !== undefined && !isFiniteNumber(item.updatedAt)) return false;
    }
  }

  // 6. fundingGoals
  if (payload.fundingGoals !== undefined) {
    if (!Array.isArray(payload.fundingGoals) || payload.fundingGoals.length > BUDGET_LIMITS.MAX_FUNDING_GOALS) {
      return false;
    }
    for (const item of payload.fundingGoals) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.contributorId !== undefined && !isStringUnder(item.contributorId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.contributorId)) return false;
      if (item.accountId !== undefined && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return false;
      if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.amountPerPay !== undefined && !isFiniteNumber(item.amountPerPay)) return false;
      if (item.amount !== undefined && !isFiniteNumber(item.amount)) return false;
      if (item.frequency !== undefined && !isStringUnder(item.frequency, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
    }
  }

  // 7. loans
  if (payload.loans !== undefined) {
    if (!Array.isArray(payload.loans) || payload.loans.length > BUDGET_LIMITS.MAX_LOANS) {
      return false;
    }
    for (const item of payload.loans) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.description !== undefined && !isStringUnder(item.description, 500)) return false;
      if (item.principal !== undefined && !isFiniteNumber(item.principal)) return false;
      if (item.annualInterestRate !== undefined && !isFiniteNumber(item.annualInterestRate)) return false;
      if (item.termMonths !== undefined && !isFiniteNumber(item.termMonths)) return false;
      if (item.monthlyPayment !== undefined && !isFiniteNumber(item.monthlyPayment)) return false;
      if (item.extraPayment !== undefined && !isFiniteNumber(item.extraPayment)) return false;
      if (item.startDate !== undefined && !isStringUnder(item.startDate, 50)) return false;
      if (item.isArchived !== undefined && typeof item.isArchived !== 'boolean') return false;
    }
  }

  // 8. loan (legacy single object)
  if (payload.loan !== undefined) {
    if (!isObject(payload.loan)) return false;
    const item = payload.loan;
    if (item.name !== undefined && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
    if (item.description !== undefined && !isStringUnder(item.description, 500)) return false;
    if (item.principal !== undefined && !isFiniteNumber(item.principal)) return false;
    if (item.annualInterestRate !== undefined && !isFiniteNumber(item.annualInterestRate)) return false;
    if (item.termMonths !== undefined && !isFiniteNumber(item.termMonths)) return false;
    if (item.monthlyPayment !== undefined && !isFiniteNumber(item.monthlyPayment)) return false;
    if (item.extraPayment !== undefined && !isFiniteNumber(item.extraPayment)) return false;
    if (item.startDate !== undefined && !isStringUnder(item.startDate, 50)) return false;
  }

  // 9. dashboardWidgets
  if (payload.dashboardWidgets !== undefined) {
    if (!Array.isArray(payload.dashboardWidgets) || payload.dashboardWidgets.length > BUDGET_LIMITS.MAX_DASHBOARD_WIDGETS) {
      return false;
    }
    for (const item of payload.dashboardWidgets) {
      if (!isObject(item)) return false;
      if (item.id !== undefined && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return false;
      if (item.title !== undefined && !isStringUnder(item.title, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      if (item.description !== undefined && !isStringUnder(item.description, 500)) return false;
      if (item.category !== undefined && !isStringUnder(item.category, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return false;
      if (item.visible !== undefined && typeof item.visible !== 'boolean') return false;
      if (item.width !== undefined && !isStringUnder(item.width, 50)) return false;
    }
  }

  // 10. dailyMatrix
  if (payload.dailyMatrix !== undefined) {
    if (!isObject(payload.dailyMatrix)) return false;
    const matrixKeys = Object.keys(payload.dailyMatrix);
    if (matrixKeys.length > BUDGET_LIMITS.MAX_DAILY_MATRIX_KEYS) return false;
    for (const k of matrixKeys) {
      if (typeof k !== 'string' || k.length > BUDGET_LIMITS.MAX_ID_LEN) return false;
      const v = payload.dailyMatrix[k];
      if (!isFiniteNumber(v)) return false;
    }
  }

  // 11. theme
  if (payload.theme !== undefined) {
    if (!isStringUnder(payload.theme, 50)) return false;
  }

  // 12. hideDashboardHeader
  if (payload.hideDashboardHeader !== undefined) {
    if (typeof payload.hideDashboardHeader !== 'boolean') return false;
  }

  // 13. categories
  if (payload.categories !== undefined) {
    if (!Array.isArray(payload.categories) || payload.categories.length > BUDGET_LIMITS.MAX_CATEGORIES) {
      return false;
    }
    for (const cat of payload.categories) {
      if (typeof cat === 'string') {
        if (cat.length > BUDGET_LIMITS.MAX_NAME_LEN) return false;
      } else if (isObject(cat)) {
        if (cat.id !== undefined && !isStringUnder(cat.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(cat.id)) return false;
        if (cat.name !== undefined && !isStringUnder(cat.name, BUDGET_LIMITS.MAX_NAME_LEN)) return false;
      } else {
        return false;
      }
    }
  }

  return true;
}

async function handleSyncBackup(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await readJson(request, MAX_BODY_SYNC);
    if (!body) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid or oversized request body.');

    const baseVersion = body.baseVersion;
    const force = Boolean(body.force);
    const hasBaseVersion = typeof baseVersion === 'number' && !isNaN(baseVersion);

    if (!hasBaseVersion && !force) {
      return json({ code: ERROR_CODES.VALIDATION_ERROR, error: 'baseVersion is required' }, 400);
    }

    let payload;
    if (body.budget !== undefined) {
      payload = body.budget;
    } else {
      const { baseVersion: _bv, force: _fc, ...rest } = body;
      payload = rest;
    }

    if (!validateBudgetPayload(payload)) {
      return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'Invalid backup payload.', context.requestId);
    }

    const dataStr = JSON.stringify(payload);
    const dataByteLength = new TextEncoder().encode(dataStr).length;
    if (dataByteLength > MAX_BODY_SYNC) return fail(ERROR_CODES.VALIDATION_ERROR, 413, 'Backup payload is too large.');

    const row = await env.DB.prepare(
      'SELECT updated_at, updated_at_ms, data_byte_length FROM user_backups WHERE id = ?'
    ).bind(userId).first();

    const storedVersion = row ? (row.updated_at_ms != null ? Number(row.updated_at_ms) : (row.updated_at ? new Date(row.updated_at).getTime() : 0)) : null;

    if (row && !force && hasBaseVersion && storedVersion > baseVersion) {
      const dataRow = await env.DB.prepare(
        'SELECT data FROM user_backups WHERE id = ?'
      ).bind(userId).first();
      let serverData;
      try {
        serverData = dataRow && dataRow.data ? JSON.parse(dataRow.data) : null;
      } catch {
        serverData = dataRow ? dataRow.data : null;
      }
      emitMetric('sync.backup.conflict', context.requestId);
      return json({
        code: ERROR_CODES.SYNC_CONFLICT,
        conflict: true,
        error: 'Cloud data has changed since your last sync.',
        serverData: serverData && serverData.budget !== undefined ? serverData.budget : serverData,
        serverVersion: storedVersion
      }, 409);
    }

    if (row && row.data_byte_length > 0 && !force) {
      const incomingSize = dataByteLength;
      const storedSize = Number(row.data_byte_length);
      if (incomingSize < storedSize * 0.1) {
        emitMetric('sync.backup.suspicious', context.requestId);
        return json({
          code: ERROR_CODES.SYNC_SUSPICIOUS,
          suspicious: true,
          error: 'Incoming backup is suspiciously smaller than stored backup.'
        }, 409);
      }
    }

    const now = Math.max(Date.now(), hasBaseVersion ? baseVersion + 1 : 0);
    const versionId = crypto.randomUUID();

    const batchResults = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO user_backup_versions (id, user_id, data, saved_at)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM user_backups WHERE id = ?)
            OR EXISTS (
              SELECT 1 FROM user_backups
               WHERE id = ?
                 AND (? = 1 OR updated_at_ms IS NULL OR updated_at_ms <= ?)
            )`
      ).bind(versionId, userId, dataStr, now, userId, userId, force ? 1 : 0, hasBaseVersion ? baseVersion : 0),

      env.DB.prepare(
        `DELETE FROM user_backup_versions
         WHERE user_id = ?
           AND id NOT IN (
             SELECT id FROM user_backup_versions
              WHERE user_id = ?
              ORDER BY saved_at DESC, rowid DESC
              LIMIT 10
           )`
      ).bind(userId, userId),

      env.DB.prepare(
        `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms)
         VALUES (?, ?, ?, datetime('now'), ?)
         ON CONFLICT(id) DO UPDATE SET
           data = excluded.data,
           data_byte_length = excluded.data_byte_length,
           updated_at = excluded.updated_at,
           updated_at_ms = excluded.updated_at_ms
         WHERE (? = 1 OR user_backups.updated_at_ms IS NULL OR user_backups.updated_at_ms <= ?)`
      ).bind(userId, dataStr, dataByteLength, now, force ? 1 : 0, hasBaseVersion ? baseVersion : 0)
    ]);

    const backupResult = batchResults && batchResults[2];
    const changes = backupResult?.meta?.changes ?? backupResult?.changes ?? 0;

    if (changes === 0 && !force) {
      await env.DB.prepare('DELETE FROM user_backup_versions WHERE id = ?').bind(versionId).run();

      const freshRow = await env.DB.prepare(
        'SELECT data, updated_at, updated_at_ms FROM user_backups WHERE id = ?'
      ).bind(userId).first();

      const freshVersion = freshRow
        ? (freshRow.updated_at_ms != null
            ? Number(freshRow.updated_at_ms)
            : (freshRow.updated_at ? new Date(freshRow.updated_at).getTime() : 0))
        : null;

      let serverData;
      try {
        serverData = freshRow && freshRow.data ? JSON.parse(freshRow.data) : null;
      } catch {
        serverData = freshRow ? freshRow.data : null;
      }

      emitMetric('sync.backup.conflict', context.requestId);
      return json({
        code: ERROR_CODES.SYNC_CONFLICT,
        conflict: true,
        error: 'Cloud data has changed since your last sync.',
        serverData: serverData && serverData.budget !== undefined ? serverData.budget : serverData,
        serverVersion: freshVersion
      }, 409);
    }

    emitMetric('sync.backup.success', context.requestId);
    return json({ success: true, version: now, timestamp: new Date(now).toISOString() });
  } catch (err) {
    console.error('[sync/backup] error:', context.requestId ? { requestId: context.requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Backup failed.', context.requestId);
  }
}

async function handleSyncRestore(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const row = await env.DB.prepare(
      'SELECT data, updated_at, updated_at_ms FROM user_backups WHERE id = ?'
    ).bind(userId).first();

    if (!row || !row.data) {
      emitMetric('sync.restore.not_found', context.requestId);
      return fail(ERROR_CODES.NOT_FOUND, 404, 'No cloud backup found', context.requestId);
    }

    const version = row.updated_at_ms != null ? Number(row.updated_at_ms) : (row.updated_at ? new Date(row.updated_at).getTime() : 0);
    const etag = `"backup-${version}"`;

    const ifNoneMatch = request?.headers?.get('if-none-match');
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-store'
        }
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(row.data);
    } catch {
      console.error('[sync/restore] stored backup is not valid JSON for user', userId);
      return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Stored backup could not be read.', context.requestId);
    }

    const updatedAtIso = version ? new Date(version).toISOString() : row.updated_at;

    emitMetric('sync.restore.success', context.requestId);
    return json({
      success: true,
      budget: parsed && parsed.budget !== undefined ? parsed.budget : parsed,
      updatedAt: updatedAtIso,
      version: version
    }, 200, {
      'ETag': etag,
      'Cache-Control': 'no-store'
    });
  } catch (err) {
    console.error('[sync/restore] error:', context.requestId ? { requestId: context.requestId } : '', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Restore failed.', context.requestId);
  }
}

async function handleSyncVersions(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: false });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const rows = await env.DB.prepare(
      `SELECT id, saved_at FROM user_backup_versions
       WHERE user_id = ?
       ORDER BY saved_at DESC, rowid DESC
       LIMIT 10`
    ).bind(userId).all();

    const versions = (rows?.results || []).map(r => ({
      id: r.id,
      savedAt: Number(r.saved_at)
    }));

    const latestSavedAt = versions.length > 0 ? versions[0].savedAt : 0;
    const etag = `"versions-${latestSavedAt}-${versions.length}"`;

    const ifNoneMatch = request?.headers?.get('if-none-match');
    if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
      return new Response(null, {
        status: 304,
        headers: {
          'ETag': etag,
          'Cache-Control': 'no-store'
        }
      });
    }

    return json({ success: true, versions }, 200, {
      'ETag': etag,
      'Cache-Control': 'no-store'
    });
  } catch (err) {
    console.error('[sync/versions] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to retrieve backup versions.');
  }
}

async function handleSyncRestoreVersion(context) {
  const { request, env } = context;
  try {
    const auth = await authenticate(context, { requireCsrf: true });
    if (auth.error) return auth.error;
    const userId = auth.user.id;

    const body = await readJson(request, MAX_BODY_AUTH);
    const versionId = body && typeof body.versionId === 'string' ? body.versionId.trim() : '';
    if (!versionId) return fail(ERROR_CODES.VALIDATION_ERROR, 400, 'versionId is required');

    const versionRow = await env.DB.prepare(
      'SELECT id, user_id, data, saved_at FROM user_backup_versions WHERE id = ?'
    ).bind(versionId).first();

    if (!versionRow) return fail(ERROR_CODES.NOT_FOUND, 404, 'Version not found');

    if (versionRow.user_id !== userId) {
      return fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden: cannot restore another user\'s version');
    }

    let parsed;
    try {
      parsed = JSON.parse(versionRow.data);
    } catch {
      console.error('[sync/restore-version] version data corrupted for version', versionId);
      return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Stored version data could not be read.');
    }

    const now = Date.now();
    const versionByteLength = new TextEncoder().encode(versionRow.data).length;
    await env.DB.prepare(
      `INSERT INTO user_backups (id, data, data_byte_length, updated_at, updated_at_ms)
       VALUES (?, ?, ?, datetime('now'), ?)
       ON CONFLICT(id) DO UPDATE SET
         data = excluded.data,
         data_byte_length = excluded.data_byte_length,
         updated_at = excluded.updated_at,
         updated_at_ms = excluded.updated_at_ms`
    ).bind(userId, versionRow.data, versionByteLength, now).run();

    return json({
      success: true,
      budget: parsed && parsed.budget !== undefined ? parsed.budget : parsed,
      version: now,
      updatedAt: new Date(now).toISOString()
    });
  } catch (err) {
    console.error('[sync/restore-version] error:', err && err.message);
    return fail(ERROR_CODES.INTERNAL_ERROR, 500, 'Restore version failed.');
  }
}

/* ------------------------------------------------------------------ */
/* Router & Dispatch                                                   */
/* ------------------------------------------------------------------ */

const ROUTES = {
  // NOTE (Breaking Change): POST /api/verify-sync-code now requires a valid authenticated
  // session (auth_token cookie/bearer + CSRF token) before code comparison runs.
  // Pre-login invocation is no longer permitted. Per-account rate limiting is keyed on auth.user.id.
  'POST /api/verify-sync-code': handleVerifySyncCode,
  'POST /api/sync/backup': handleSyncBackup,
  'GET /api/sync/restore': handleSyncRestore,
  'GET /api/sync/versions': handleSyncVersions,
  'POST /api/sync/restore-version': handleSyncRestoreVersion,
  'POST /api/auth/register': registerHandler,
  'POST /api/auth/login': loginHandler,
  'POST /api/auth/forgot-password': forgotPasswordHandler,
  'POST /api/auth/reset-password': resetPasswordHandler,
  'GET /api/auth/security-question': securityQuestionHandler,
  'POST /api/auth/update-profile': updateProfileHandler,
  'POST /api/auth/verify-email': verifyEmailHandler,
  'POST /api/auth/resend-verification': resendVerificationHandler,
  'POST /api/auth/confirm-email-change': confirmEmailChangeHandler,
  'POST /api/auth/refresh': refreshHandler,
  'GET /api/auth/me': meHandler,
  'POST /api/auth/logout': logoutHandler,
  'GET /api/admin/stats': adminStatsHandler,
  'POST /api/admin/user-status': adminUserStatusHandler
};

async function fetchAsset(env, request, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  const assetRequest = new Request(assetUrl.toString(), request);
  if (env?.ASSETS?.fetch) return env.ASSETS.fetch(assetRequest);
  return fetch(assetRequest);
}

const worker = {
  /**
   * @param {Request} request
   * @param {Record<string, any>} env
   * @param {any} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const context = { request, env, ctx, requestId };
    const host = request.headers.get('host') || url.host || '';
    const hasCfRay = Boolean(request.headers.get('cf-ray'));
    if (!env?.ENVIRONMENT && hasCfRay) {
      console.warn('[worker] WARNING: env.ENVIRONMENT is undefined on request with cf-ray present. Production security headers (CSP/HSTS) may be disabled.');
    }
    const isProduction = env?.ENVIRONMENT === 'production';
    const isLocalhost = !isProduction || url.hostname === 'localhost' || url.hostname === '127.0.0.1' || host.includes('localhost') || host.includes('127.0.0.1') || Boolean(url.port);
    const requestOrigin = request.headers.get('Origin') || '';
    const nonce = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    const headerOpts = { isLocalhost, isProduction, requestOrigin, nonce, requestPath: url.pathname };

    if (isProduction && !isLocalhost && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === 'OPTIONS') {
      if (!requestOrigin || !ALLOWED_ORIGINS.includes(requestOrigin)) {
        return addSecurityHeaders(new Response(null, { status: 403 }), headerOpts);
      }
      return addSecurityHeaders(new Response(null, { status: 204 }), headerOpts);
    }

    // Canonical SPA mount: dist/client/index.html references /finance/assets/*.
    // Therefore /finance is the canonical mount path. Bare / redirects 301 to /finance.
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/finance';
      return Response.redirect(url.toString(), 301);
    }

    // Redirect requests for Outpost sub-site (/Outpost, /OUTPOST, /auction) to lowercase /outpost (production only)
    if (isProduction && /^\/(outpost|auction)($|\/|\?)/i.test(url.pathname)) {
      if (!url.pathname.startsWith('/outpost')) {
        const outpostUrl = new URL(request.url);
        outpostUrl.pathname = outpostUrl.pathname.replace(/^\/(outpost|auction)/i, '/outpost');
        return Response.redirect(outpostUrl.toString(), 301);
      }
    }

    let response;
    try {
      let apiPath = url.pathname;
      if (apiPath.startsWith('/finance/api/')) {
        apiPath = apiPath.slice('/finance'.length);
      } else if (apiPath === '/finance/api') {
        apiPath = '/api';
      }

      let handler = ROUTES[`${request.method} ${apiPath}`];
      let handlerContext = context;

      if (!handler && request.method === 'POST') {
        const userStatusMatch = apiPath.match(/^\/api\/admin\/user\/([^/]+)\/status$/);
        if (userStatusMatch) {
          handler = adminUserStatusHandler;
          handlerContext = { ...context, params: { id: decodeURIComponent(userStatusMatch[1]) } };
        }
      }

      if (handler) {
        if (
          request.method !== 'GET' &&
          requestOrigin &&
          !ALLOWED_ORIGINS.includes(requestOrigin)
        ) {
          response = fail(ERROR_CODES.FORBIDDEN, 403, 'Forbidden', requestId);
        } else {
          response = await handler(handlerContext);
        }
      } else if (apiPath.startsWith('/api/')) {
        response = fail(ERROR_CODES.NOT_FOUND, 404, 'Endpoint not found', requestId);
      } else if (url.pathname.startsWith('/finance/assets/')) {
        response = await fetchAsset(env, request, url.pathname.slice('/finance'.length));
      } else if (url.pathname.startsWith('/finance/') && /\.[a-zA-Z0-9]+$/.test(url.pathname)) {
        response = await fetchAsset(env, request, url.pathname.slice('/finance'.length));
      } else if (url.pathname === '/finance' || url.pathname.startsWith('/finance/')) {
        response = await fetchAsset(env, request, '/');
      } else {
        response = env?.ASSETS?.fetch ? await env.ASSETS.fetch(request) : await fetch(request);
      }
    } catch (err) {
      console.error('[worker] unhandled error:', requestId ? { requestId } : '', err && err.message, err && err.stack);
      response = fail(ERROR_CODES.INTERNAL_ERROR, 500, 'An internal error occurred.', requestId);
    }

    return addSecurityHeaders(response, headerOpts);
  }
};

export { addSecurityHeaders, fetchAsset };
export default worker;
