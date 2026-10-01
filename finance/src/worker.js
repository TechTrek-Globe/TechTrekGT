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

export const PRODUCTION_ORIGINS = [
  'https://techtrekgt.com',
  'http://techtrekgt.com',
  'https://techtrek-budget.pages.dev'
];

export const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8787',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8787'
];

export const ALLOWED_ORIGINS = PRODUCTION_ORIGINS.concat(DEV_ORIGINS);

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
  const effectiveAllowedOrigins = opts.allowedOrigins || PRODUCTION_ORIGINS.concat(isProduction ? [] : DEV_ORIGINS);

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
  if (requestOrigin && effectiveAllowedOrigins.includes(requestOrigin)) {
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
  if (map === null || map === undefined) return true;
  if (!isObject(map)) return false;
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string' || k.length > maxKeyLen) return false;
    if (v !== null && v !== undefined && !isFiniteNumber(v)) return false;
  }
  return true;
}

/**
 * Validates incoming budget payload against explicit schema, type, and length constraints.
 * Rejects unknown top-level keys to prevent unauthorized or unexpected field injection.
 * Enforces collection count limits and per-field type and string length boundaries.
 * Null values on optional fields are gracefully permitted.
 *
 * @param {*} payload - The budget data object to validate
 * @returns {{ valid: boolean, reason?: string }} Result object with validation status and failure reason
 */
export function validateBudgetPayloadDetailed(payload) {
  if (!isObject(payload)) {
    return { valid: false, reason: 'Payload must be an object' };
  }

  // Reject unknown top-level keys
  const keys = Object.keys(payload);
  for (const key of keys) {
    if (!ALLOWED_BUDGET_KEYS.has(key)) {
      return { valid: false, reason: `Unknown top-level key: ${key}` };
    }
  }

  // 1. accounts
  if (payload.accounts !== undefined) {
    if (!Array.isArray(payload.accounts) || payload.accounts.length > BUDGET_LIMITS.MAX_ACCOUNTS) {
      return { valid: false, reason: `accounts must be an array <= ${BUDGET_LIMITS.MAX_ACCOUNTS}` };
    }
    for (let i = 0; i < payload.accounts.length; i++) {
      const item = payload.accounts[i];
      if (!isObject(item)) return { valid: false, reason: `accounts[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `accounts[${i}].id invalid` };
      if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `accounts[${i}].name invalid` };
      if (item.type !== undefined && item.type !== null && !isStringUnder(item.type, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `accounts[${i}].type invalid` };
      if (item.color !== undefined && item.color !== null && !isStringUnder(item.color, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `accounts[${i}].color invalid` };
      if (item.notes !== undefined && item.notes !== null && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return { valid: false, reason: `accounts[${i}].notes invalid` };
      if (item.startingBalance !== undefined && item.startingBalance !== null && !isFiniteNumber(item.startingBalance)) return { valid: false, reason: `accounts[${i}].startingBalance invalid` };
      if (item.extraStartingBalance !== undefined && item.extraStartingBalance !== null && !isFiniteNumber(item.extraStartingBalance)) return { valid: false, reason: `accounts[${i}].extraStartingBalance invalid` };
      if (item.saveExtraMonthly !== undefined && item.saveExtraMonthly !== null && !isFiniteNumber(item.saveExtraMonthly)) return { valid: false, reason: `accounts[${i}].saveExtraMonthly invalid` };
      if (item.enableExtraSavings !== undefined && item.enableExtraSavings !== null && typeof item.enableExtraSavings !== 'boolean') return { valid: false, reason: `accounts[${i}].enableExtraSavings invalid` };
      if (item.isArchived !== undefined && item.isArchived !== null && typeof item.isArchived !== 'boolean') return { valid: false, reason: `accounts[${i}].isArchived invalid` };
      if (item.overflowSplits !== undefined && item.overflowSplits !== null && !validateStringMap(item.overflowSplits)) return { valid: false, reason: `accounts[${i}].overflowSplits invalid` };
      if (item.saveExtraSplits !== undefined && item.saveExtraSplits !== null && !validateStringMap(item.saveExtraSplits)) return { valid: false, reason: `accounts[${i}].saveExtraSplits invalid` };
      if (item.importedLedgerRows !== undefined && item.importedLedgerRows !== null && !isObject(item.importedLedgerRows)) return { valid: false, reason: `accounts[${i}].importedLedgerRows invalid` };
    }
  }

  // 2. people
  if (payload.people !== undefined) {
    if (!Array.isArray(payload.people) || payload.people.length > BUDGET_LIMITS.MAX_PEOPLE) {
      return { valid: false, reason: `people must be an array <= ${BUDGET_LIMITS.MAX_PEOPLE}` };
    }
    for (let i = 0; i < payload.people.length; i++) {
      const item = payload.people[i];
      if (!isObject(item)) return { valid: false, reason: `people[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `people[${i}].id invalid` };
      if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `people[${i}].name invalid` };
      if (item.role !== undefined && item.role !== null && !isStringUnder(item.role, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `people[${i}].role invalid` };
      if (item.payFrequency !== undefined && item.payFrequency !== null && !isStringUnder(item.payFrequency, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `people[${i}].payFrequency invalid` };
      if (item.color !== undefined && item.color !== null && !isStringUnder(item.color, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `people[${i}].color invalid` };
      if (item.payDay1 !== undefined && item.payDay1 !== null && !isStringUnder(item.payDay1, 50) && !isFiniteNumber(item.payDay1)) return { valid: false, reason: `people[${i}].payDay1 invalid` };
      if (item.payDay2 !== undefined && item.payDay2 !== null && !isStringUnder(item.payDay2, 50) && !isFiniteNumber(item.payDay2)) return { valid: false, reason: `people[${i}].payDay2 invalid` };
      if (item.payOffsetDays !== undefined && item.payOffsetDays !== null && !isFiniteNumber(item.payOffsetDays)) return { valid: false, reason: `people[${i}].payOffsetDays invalid` };
      if (item.grossPerPay !== undefined && item.grossPerPay !== null && !isFiniteNumber(item.grossPerPay)) return { valid: false, reason: `people[${i}].grossPerPay invalid` };
      if (item.netPerPay !== undefined && item.netPerPay !== null && !isFiniteNumber(item.netPerPay)) return { valid: false, reason: `people[${i}].netPerPay invalid` };
      if (item.isArchived !== undefined && item.isArchived !== null && typeof item.isArchived !== 'boolean') return { valid: false, reason: `people[${i}].isArchived invalid` };
      if (item.accountAllocations !== undefined && item.accountAllocations !== null && !validateStringMap(item.accountAllocations)) return { valid: false, reason: `people[${i}].accountAllocations invalid` };
      if (item.notes !== undefined && item.notes !== null && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return { valid: false, reason: `people[${i}].notes invalid` };
    }
  }

  // 3. bills
  if (payload.bills !== undefined) {
    if (!Array.isArray(payload.bills) || payload.bills.length > BUDGET_LIMITS.MAX_BILLS) {
      return { valid: false, reason: `bills must be an array <= ${BUDGET_LIMITS.MAX_BILLS}` };
    }
    for (let i = 0; i < payload.bills.length; i++) {
      const item = payload.bills[i];
      if (!isObject(item)) return { valid: false, reason: `bills[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `bills[${i}].id invalid` };
      if (item.accountId !== undefined && item.accountId !== null && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return { valid: false, reason: `bills[${i}].accountId invalid` };
      if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `bills[${i}].name invalid` };
      if (item.amount !== undefined && item.amount !== null && !isFiniteNumber(item.amount)) return { valid: false, reason: `bills[${i}].amount invalid` };
      if (item.period !== undefined && item.period !== null && !isStringUnder(item.period, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `bills[${i}].period invalid` };
      if (item.dueDay !== undefined && item.dueDay !== null && !isStringUnder(item.dueDay, 50) && !isFiniteNumber(item.dueDay)) return { valid: false, reason: `bills[${i}].dueDay invalid` };
      if (item.paymentSource !== undefined && item.paymentSource !== null && !isStringUnder(item.paymentSource, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `bills[${i}].paymentSource invalid` };
      if (item.notes !== undefined && item.notes !== null && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return { valid: false, reason: `bills[${i}].notes invalid` };
      if (item.matchingKey !== undefined && item.matchingKey !== null && !isStringUnder(item.matchingKey, 1000)) return { valid: false, reason: `bills[${i}].matchingKey invalid` };
      if (item.bankMatchNames !== undefined && item.bankMatchNames !== null && !isStringUnder(item.bankMatchNames, 1000)) return { valid: false, reason: `bills[${i}].bankMatchNames invalid` };
      if (item.isArchived !== undefined && item.isArchived !== null && typeof item.isArchived !== 'boolean') return { valid: false, reason: `bills[${i}].isArchived invalid` };
      if (item.splits !== undefined && item.splits !== null && !validateStringMap(item.splits)) return { valid: false, reason: `bills[${i}].splits invalid` };
      if (item.months !== undefined && item.months !== null) {
        if (!Array.isArray(item.months) || item.months.length > 12) return { valid: false, reason: `bills[${i}].months must be an array <= 12` };
        for (const m of item.months) {
          if (!isFiniteNumber(m)) return { valid: false, reason: `bills[${i}].months contains non-finite number` };
        }
      }
    }
  }

  // 4. transactions
  if (payload.transactions !== undefined) {
    if (!Array.isArray(payload.transactions) || payload.transactions.length > BUDGET_LIMITS.MAX_TRANSACTIONS) {
      return { valid: false, reason: `transactions must be an array <= ${BUDGET_LIMITS.MAX_TRANSACTIONS}` };
    }
    for (let i = 0; i < payload.transactions.length; i++) {
      const item = payload.transactions[i];
      if (!isObject(item)) return { valid: false, reason: `transactions[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `transactions[${i}].id invalid` };
      if (item.accountId !== undefined && item.accountId !== null && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return { valid: false, reason: `transactions[${i}].accountId invalid` };
      if (item.date !== undefined && item.date !== null && !isStringUnder(item.date, 50)) return { valid: false, reason: `transactions[${i}].date invalid` };
      if (item.amount !== undefined && item.amount !== null && !isFiniteNumber(item.amount)) return { valid: false, reason: `transactions[${i}].amount invalid` };
      if (item.description !== undefined && item.description !== null && !isStringUnder(item.description, 500)) return { valid: false, reason: `transactions[${i}].description invalid` };
      if (item.notes !== undefined && item.notes !== null && !isStringUnder(item.notes, BUDGET_LIMITS.MAX_TEXT_LEN)) return { valid: false, reason: `transactions[${i}].notes invalid` };
      if (item.category !== undefined && item.category !== null && !isStringUnder(item.category, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `transactions[${i}].category invalid` };
      if (item.personId !== undefined && item.personId !== null && !isStringUnder(item.personId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.personId)) return { valid: false, reason: `transactions[${i}].personId invalid` };
      if (item.billId !== undefined && item.billId !== null && !isStringUnder(item.billId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.billId)) return { valid: false, reason: `transactions[${i}].billId invalid` };
      if (item.isOther !== undefined && item.isOther !== null && typeof item.isOther !== 'boolean') return { valid: false, reason: `transactions[${i}].isOther invalid` };
      if (item.type !== undefined && item.type !== null && !isStringUnder(item.type, 50)) return { valid: false, reason: `transactions[${i}].type invalid` };
      if (item.status !== undefined && item.status !== null && !isStringUnder(item.status, 50)) return { valid: false, reason: `transactions[${i}].status invalid` };
    }
  }

  // 5. lineItems
  if (payload.lineItems !== undefined) {
    if (!Array.isArray(payload.lineItems) || payload.lineItems.length > BUDGET_LIMITS.MAX_LINE_ITEMS) {
      return { valid: false, reason: `lineItems must be an array <= ${BUDGET_LIMITS.MAX_LINE_ITEMS}` };
    }
    for (let i = 0; i < payload.lineItems.length; i++) {
      const item = payload.lineItems[i];
      if (!isObject(item)) return { valid: false, reason: `lineItems[${i}] must be an object` };
      if (item.billId !== undefined && item.billId !== null && !isStringUnder(item.billId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.billId)) return { valid: false, reason: `lineItems[${i}].billId invalid` };
      if (item.monthKey !== undefined && item.monthKey !== null && !isStringUnder(item.monthKey, 50)) return { valid: false, reason: `lineItems[${i}].monthKey invalid` };
      if (item.actualAmount !== undefined && item.actualAmount !== null && !isFiniteNumber(item.actualAmount)) return { valid: false, reason: `lineItems[${i}].actualAmount invalid` };
      if (item.updatedAt !== undefined && item.updatedAt !== null && !isFiniteNumber(item.updatedAt)) return { valid: false, reason: `lineItems[${i}].updatedAt invalid` };
    }
  }

  // 6. fundingGoals
  if (payload.fundingGoals !== undefined) {
    if (!Array.isArray(payload.fundingGoals) || payload.fundingGoals.length > BUDGET_LIMITS.MAX_FUNDING_GOALS) {
      return { valid: false, reason: `fundingGoals must be an array <= ${BUDGET_LIMITS.MAX_FUNDING_GOALS}` };
    }
    for (let i = 0; i < payload.fundingGoals.length; i++) {
      const item = payload.fundingGoals[i];
      if (!isObject(item)) return { valid: false, reason: `fundingGoals[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `fundingGoals[${i}].id invalid` };
      if (item.contributorId !== undefined && item.contributorId !== null && !isStringUnder(item.contributorId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.contributorId)) return { valid: false, reason: `fundingGoals[${i}].contributorId invalid` };
      if (item.accountId !== undefined && item.accountId !== null && !isStringUnder(item.accountId, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.accountId)) return { valid: false, reason: `fundingGoals[${i}].accountId invalid` };
      if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `fundingGoals[${i}].name invalid` };
      if (item.amountPerPay !== undefined && item.amountPerPay !== null && !isFiniteNumber(item.amountPerPay)) return { valid: false, reason: `fundingGoals[${i}].amountPerPay invalid` };
      if (item.amount !== undefined && item.amount !== null && !isFiniteNumber(item.amount)) return { valid: false, reason: `fundingGoals[${i}].amount invalid` };
      if (item.frequency !== undefined && item.frequency !== null && !isStringUnder(item.frequency, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `fundingGoals[${i}].frequency invalid` };
    }
  }

  // 7. loans
  if (payload.loans !== undefined) {
    if (!Array.isArray(payload.loans) || payload.loans.length > BUDGET_LIMITS.MAX_LOANS) {
      return { valid: false, reason: `loans must be an array <= ${BUDGET_LIMITS.MAX_LOANS}` };
    }
    for (let i = 0; i < payload.loans.length; i++) {
      const item = payload.loans[i];
      if (!isObject(item)) return { valid: false, reason: `loans[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `loans[${i}].id invalid` };
      if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `loans[${i}].name invalid` };
      if (item.description !== undefined && item.description !== null && !isStringUnder(item.description, 500)) return { valid: false, reason: `loans[${i}].description invalid` };
      if (item.principal !== undefined && item.principal !== null && !isFiniteNumber(item.principal)) return { valid: false, reason: `loans[${i}].principal invalid` };
      if (item.annualInterestRate !== undefined && item.annualInterestRate !== null && !isFiniteNumber(item.annualInterestRate)) return { valid: false, reason: `loans[${i}].annualInterestRate invalid` };
      if (item.termMonths !== undefined && item.termMonths !== null && !isFiniteNumber(item.termMonths)) return { valid: false, reason: `loans[${i}].termMonths invalid` };
      if (item.monthlyPayment !== undefined && item.monthlyPayment !== null && !isFiniteNumber(item.monthlyPayment)) return { valid: false, reason: `loans[${i}].monthlyPayment invalid` };
      if (item.extraPayment !== undefined && item.extraPayment !== null && !isFiniteNumber(item.extraPayment)) return { valid: false, reason: `loans[${i}].extraPayment invalid` };
      if (item.startDate !== undefined && item.startDate !== null && !isStringUnder(item.startDate, 50)) return { valid: false, reason: `loans[${i}].startDate invalid` };
      if (item.isArchived !== undefined && item.isArchived !== null && typeof item.isArchived !== 'boolean') return { valid: false, reason: `loans[${i}].isArchived invalid` };
    }
  }

  // 8. loan (legacy single object)
  if (payload.loan !== undefined && payload.loan !== null) {
    if (!isObject(payload.loan)) return { valid: false, reason: 'loan must be an object' };
    const item = payload.loan;
    if (item.name !== undefined && item.name !== null && !isStringUnder(item.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: 'loan.name invalid' };
    if (item.description !== undefined && item.description !== null && !isStringUnder(item.description, 500)) return { valid: false, reason: 'loan.description invalid' };
    if (item.principal !== undefined && item.principal !== null && !isFiniteNumber(item.principal)) return { valid: false, reason: 'loan.principal invalid' };
    if (item.annualInterestRate !== undefined && item.annualInterestRate !== null && !isFiniteNumber(item.annualInterestRate)) return { valid: false, reason: 'loan.annualInterestRate invalid' };
    if (item.termMonths !== undefined && item.termMonths !== null && !isFiniteNumber(item.termMonths)) return { valid: false, reason: 'loan.termMonths invalid' };
    if (item.monthlyPayment !== undefined && item.monthlyPayment !== null && !isFiniteNumber(item.monthlyPayment)) return { valid: false, reason: 'loan.monthlyPayment invalid' };
    if (item.extraPayment !== undefined && item.extraPayment !== null && !isFiniteNumber(item.extraPayment)) return { valid: false, reason: 'loan.extraPayment invalid' };
    if (item.startDate !== undefined && item.startDate !== null && !isStringUnder(item.startDate, 50)) return { valid: false, reason: 'loan.startDate invalid' };
  }

  // 9. dashboardWidgets
  if (payload.dashboardWidgets !== undefined) {
    if (!Array.isArray(payload.dashboardWidgets) || payload.dashboardWidgets.length > BUDGET_LIMITS.MAX_DASHBOARD_WIDGETS) {
      return { valid: false, reason: `dashboardWidgets must be an array <= ${BUDGET_LIMITS.MAX_DASHBOARD_WIDGETS}` };
    }
    for (let i = 0; i < payload.dashboardWidgets.length; i++) {
      const item = payload.dashboardWidgets[i];
      if (!isObject(item)) return { valid: false, reason: `dashboardWidgets[${i}] must be an object` };
      if (item.id !== undefined && item.id !== null && !isStringUnder(item.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(item.id)) return { valid: false, reason: `dashboardWidgets[${i}].id invalid` };
      if (item.title !== undefined && item.title !== null && !isStringUnder(item.title, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `dashboardWidgets[${i}].title invalid` };
      if (item.description !== undefined && item.description !== null && !isStringUnder(item.description, 500)) return { valid: false, reason: `dashboardWidgets[${i}].description invalid` };
      if (item.category !== undefined && item.category !== null && !isStringUnder(item.category, BUDGET_LIMITS.MAX_SHORT_STR_LEN)) return { valid: false, reason: `dashboardWidgets[${i}].category invalid` };
      if (item.visible !== undefined && item.visible !== null && typeof item.visible !== 'boolean') return { valid: false, reason: `dashboardWidgets[${i}].visible invalid` };
      if (item.width !== undefined && item.width !== null && !isStringUnder(item.width, 50)) return { valid: false, reason: `dashboardWidgets[${i}].width invalid` };
    }
  }

  // 10. dailyMatrix
  if (payload.dailyMatrix !== undefined) {
    if (!isObject(payload.dailyMatrix)) return { valid: false, reason: 'dailyMatrix must be an object' };
    const matrixKeys = Object.keys(payload.dailyMatrix);
    if (matrixKeys.length > BUDGET_LIMITS.MAX_DAILY_MATRIX_KEYS) return { valid: false, reason: `dailyMatrix exceeds max keys ${BUDGET_LIMITS.MAX_DAILY_MATRIX_KEYS}` };
    for (const k of matrixKeys) {
      if (typeof k !== 'string' || k.length > BUDGET_LIMITS.MAX_ID_LEN) return { valid: false, reason: `dailyMatrix key invalid: ${k}` };
      const v = payload.dailyMatrix[k];
      if (v !== null && v !== undefined && !isFiniteNumber(v)) return { valid: false, reason: `dailyMatrix[${k}] must be a finite number or null` };
    }
  }

  // 11. theme
  if (payload.theme !== undefined && payload.theme !== null) {
    if (!isStringUnder(payload.theme, 50)) return { valid: false, reason: 'theme invalid' };
  }

  // 12. hideDashboardHeader
  if (payload.hideDashboardHeader !== undefined && payload.hideDashboardHeader !== null) {
    if (typeof payload.hideDashboardHeader !== 'boolean') return { valid: false, reason: 'hideDashboardHeader must be a boolean' };
  }

  // 13. categories
  if (payload.categories !== undefined && payload.categories !== null) {
    if (Array.isArray(payload.categories)) {
      if (payload.categories.length > BUDGET_LIMITS.MAX_CATEGORIES) return { valid: false, reason: `categories exceeds limit ${BUDGET_LIMITS.MAX_CATEGORIES}` };
      for (let i = 0; i < payload.categories.length; i++) {
        const cat = payload.categories[i];
        if (typeof cat === 'string') {
          if (cat.length > BUDGET_LIMITS.MAX_NAME_LEN) return { valid: false, reason: `categories[${i}] string length exceeded` };
        } else if (isObject(cat)) {
          if (cat.id !== undefined && cat.id !== null && !isStringUnder(cat.id, BUDGET_LIMITS.MAX_ID_LEN) && !isFiniteNumber(cat.id)) return { valid: false, reason: `categories[${i}].id invalid` };
          if (cat.name !== undefined && cat.name !== null && !isStringUnder(cat.name, BUDGET_LIMITS.MAX_NAME_LEN)) return { valid: false, reason: `categories[${i}].name invalid` };
        } else {
          return { valid: false, reason: `categories[${i}] invalid type` };
        }
      }
    } else if (isObject(payload.categories)) {
      if (Object.keys(payload.categories).length > BUDGET_LIMITS.MAX_CATEGORIES) return { valid: false, reason: `categories object keys exceeded ${BUDGET_LIMITS.MAX_CATEGORIES}` };
      for (const [k, v] of Object.entries(payload.categories)) {
        if (typeof k !== 'string' || k.length > BUDGET_LIMITS.MAX_NAME_LEN) return { valid: false, reason: `categories key invalid: ${k}` };
        if (v !== null && v !== undefined && typeof v !== 'string' && typeof v !== 'boolean' && !isFiniteNumber(v)) return { valid: false, reason: `categories[${k}] invalid value` };
      }
    } else {
      return { valid: false, reason: 'categories must be an array or object' };
    }
  }

  return { valid: true };
}

export function validateBudgetPayload(payload) {
  return validateBudgetPayloadDetailed(payload).valid;
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

    const validation = validateBudgetPayloadDetailed(payload);
    if (!validation.valid) {
      console.warn(`[sync.backup] Validation failed for user ${userId}: ${validation.reason}`);
      return json({
        code: ERROR_CODES.VALIDATION_ERROR,
        error: 'Invalid backup payload.',
        details: validation.reason,
        ...(context.requestId ? { requestId: context.requestId } : {})
      }, 400);
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
    const effectiveAllowedOrigins = PRODUCTION_ORIGINS.concat(isProduction ? [] : DEV_ORIGINS);
    const headerOpts = { isLocalhost, isProduction, requestOrigin, nonce, requestPath: url.pathname, allowedOrigins: effectiveAllowedOrigins };

    if (isProduction && !isLocalhost && url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    if (request.method === 'OPTIONS') {
      if (!requestOrigin || !effectiveAllowedOrigins.includes(requestOrigin)) {
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
          !effectiveAllowedOrigins.includes(requestOrigin)
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
