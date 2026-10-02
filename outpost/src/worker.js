import { onRequestPost as registerHandler }      from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler }         from '../functions/api/auth/login.js';
import { onRequestGet  as meHandler }            from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler }        from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler }  from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler }  from '../functions/api/auth/update-profile.js';
import { onRequestGet as verifyEmailGetHandler, onRequestPost as verifyEmailPostHandler } from '../functions/api/auth/verify-email.js';
import { onRequestGet as invoicesListHandler, onRequestPost as invoicesCreateHandler } from '../functions/api/invoices/index.js';
import { onRequestGet as invoiceGetHandler, onRequestPut as invoicePutHandler, onRequestDelete as invoiceDeleteHandler } from '../functions/api/invoices/[id].js';
import { onRequestGet as itemsListHandler } from '../functions/api/items/index.js';
import { onRequestGet as itemsEnrichedHandler } from '../functions/api/items/enriched.js';
import { onRequestPost as itemsAutoSkuHandler } from '../functions/api/items/auto-sku.js';
import { onRequestGet as itemImagePreviewHandler } from '../functions/api/items/image-preview.js';
import { onRequestGet as itemGetHandler, onRequestPut as itemPutHandler, onRequestDelete as itemDeleteHandler } from '../functions/api/items/[id].js';
import { onRequestGet as salesListHandler, onRequestPost as salesCreateHandler } from '../functions/api/sales/index.js';
import { onRequestGet as saleGetHandler, onRequestPut as salePutHandler, onRequestDelete as saleDeleteHandler } from '../functions/api/sales/[id].js';
import { onRequestGet as platformsListHandler, onRequestPost as platformsCreateHandler } from '../functions/api/platforms/index.js';
import { onRequestPut as platformPutHandler, onRequestDelete as platformDeleteHandler } from '../functions/api/platforms/[id].js';
import { onRequestGet as compsListHandler, onRequestPost as compsCreateHandler } from '../functions/api/comps/index.js';
import { onRequestGet as compGetHandler, onRequestPut as compPutHandler, onRequestDelete as compDeleteHandler } from '../functions/api/comps/[id].js';
import { onRequestGet as marketCompsGetHandler, onRequestPost as marketCompsPostHandler, onRequestPut as marketCompsPutHandler, onRequestDelete as marketCompsDeleteHandler } from '../functions/api/comps/market.js';
import { onRequestGet as dashboardHandler } from '../functions/api/dashboard.js';
import { onRequestPost as batchImportHandler } from '../functions/api/import/batch.js';
import { onRequestPost as amazonImportHandler } from '../functions/api/import/amazon.js';
import { onRequestPost as amazonUrlImportHandler } from '../functions/api/import/amazon-url.js';
import { onRequestGet as amazonTokenGetHandler, onRequestPost as amazonTokenPostHandler } from '../functions/api/import/amazon-token.js';
import { onRequestGet as syncFinanceGetHandler, onRequestPost as syncFinancePostHandler } from '../functions/api/sync/finance.js';
import { onRequestGet as taxReportGetHandler } from '../functions/api/reports/tax.js';
import { onRequestGet as marketAlertsGetHandler, onRequestPut as marketAlertsPutHandler, onRequestPost as marketAlertsPostHandler } from '../functions/api/market-alerts.js';
import { onRequestGet as adminStatsGetHandler } from '../functions/api/admin/stats.js';
import { onRequestGet as ebayOAuthStatusHandler } from '../functions/api/ebay/oauth-status.js';
import { onRequestGet as ebayFindListingsHandler } from '../functions/api/ebay/find-listings.js';
import { onRequestGet as ebayActiveListingsHandler } from '../functions/api/ebay/active-listings.js';
import { onRequestPost as ebayReconcileHandler } from '../functions/api/ebay/reconcile.js';
import { onRequestPost as ebaySyncItemHandler } from '../functions/api/ebay/sync-item.js';
import { onRequestPost as ebaySyncAllHandler } from '../functions/api/ebay/sync-all.js';
import { onRequestGet as matchSoldVinescoutGetHandler, onRequestPost as matchSoldVinescoutPostHandler } from '../functions/api/ebay/match-sold-vinescout.js';
import { onRequestPost as ebayPushSkuHandler } from '../functions/api/ebay/push-sku.js';
import { onRequestGet as ebayAnalyticsHandler, onRequestPost as ebayAnalyticsIngestHandler } from '../functions/api/ebay/analytics.js';
import { onRequestGet as vinescoutSalesExportHandler } from '../functions/api/export/vinescout-sales.js';
import { onRequestGet as vinescoutInventoryExportHandler } from '../functions/api/export/vinescout-inventory.js';
import { onRequestGet as vinescoutCatalogHandler } from '../functions/api/sync/vinescout-catalog.js';
import { onRequestPost as vinescoutCatalogPostHandler } from '../functions/api/sync/vinescout-catalog.js';
import { onRequestGet as syncSettingsGetHandler, onRequestPut as syncSettingsPutHandler } from '../functions/api/sync/settings.js';
import { onRequestGet as integrationsListHandler, onRequestPost as integrationsCreateHandler } from '../functions/api/integrations/index.js';
import { onRequestPost as integrationRevokeHandler, onRequestDelete as integrationDeleteHandler } from '../functions/api/integrations/[id].js';

// Durable Object export - required for wrangler DO binding
export { RateLimitCounter } from '../functions/utils/RateLimitCounter.js';

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class NonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(el) {
    el.setAttribute('nonce', this.nonce);
  }
}

class HeadNonceInjector {
  constructor(nonce) {
    this.nonce = nonce;
  }
  element(el) {
    el.append(`<meta name="csp-nonce" content="${this.nonce}" />`, { html: true });
  }
}

function addSecurityHeaders(response, isLocalhostOrOptions = false, maybeRequestOrigin = '', maybeNonce = '') {
  let isLocalhost = false;
  let requestOrigin = '';
  let nonce = '';

  if (typeof isLocalhostOrOptions === 'object' && isLocalhostOrOptions !== null) {
    isLocalhost = Boolean(isLocalhostOrOptions.isLocalhost);
    requestOrigin = isLocalhostOrOptions.requestOrigin || '';
    nonce = isLocalhostOrOptions.nonce || '';
  } else {
    isLocalhost = Boolean(isLocalhostOrOptions);
    requestOrigin = maybeRequestOrigin || '';
    nonce = maybeNonce || '';
  }

  const newHeaders = new Headers(response.headers);
  if (!isLocalhost) {
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const scriptSrc = nonce
      ? `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`
      : "script-src 'self' https://challenges.cloudflare.com";
    newHeaders.set('Content-Security-Policy', [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      scriptSrc,
      "connect-src 'self' https://techtrekgt.com https://challenges.cloudflare.com",
      "img-src 'self' data: blob: https://challenges.cloudflare.com https://*.ebayimg.com https://i.ebayimg.com https://*.ebaystatic.com https://*.media-amazon.com https://m.media-amazon.com https://images-na.ssl-images-amazon.com https://*.ssl-images-amazon.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "frame-src 'self' https://challenges.cloudflare.com blob:",
      "child-src 'self' https://challenges.cloudflare.com blob:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'"
    ].join('; '));
  }
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('X-Frame-Options', 'DENY');
  newHeaders.set('X-XSS-Protection', '0');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  const allowedOrigins = [
    'https://techtrekgt.com',
    'https://techtrek-outpost.pages.dev',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ];
  // Read origin from the request (not the response) - LOW-3 fix
  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    newHeaders.set('Access-Control-Allow-Origin', requestOrigin);
  } else {
    newHeaders.set('Access-Control-Allow-Origin', 'https://techtrekgt.com');
  }
  newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-VineScout-Auth');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Max-Age', '86400');

  const contentType = newHeaders.get('content-type') || '';
  const isHtml = contentType.includes('text/html');
  if (isHtml) {
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');
  }

  const rewritten = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });

  if (isHtml && nonce && response.body && typeof HTMLRewriter !== 'undefined') {
    return new HTMLRewriter()
      .on('script', new NonceInjector(nonce))
      .on('head', new HeadNonceInjector(nonce))
      .transform(rewritten);
  }

  return rewritten;
}

export const ROUTES = [
  // Auth (10 routes)
  { method: 'POST',   pattern: '/api/auth/register',          handler: registerHandler,           auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/login',             handler: loginHandler,              auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/forgot-password',   handler: forgotPasswordHandler,     auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/reset-password',    handler: resetPasswordHandler,      auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/security-question', handler: securityQuestionHandler,   auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/update-profile',    handler: updateProfileHandler,      auth: 'session' },
  { method: 'GET',    pattern: '/api/auth/me',                handler: meHandler,                 auth: 'session' },
  { method: 'GET',    pattern: '/api/auth/verify-email',      handler: verifyEmailGetHandler,     auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/verify-email',      handler: verifyEmailPostHandler,    auth: 'public' },
  { method: 'POST',   pattern: '/api/auth/logout',            handler: logoutHandler,             auth: 'public' },

  // Invoices (5 routes)
  { method: 'GET',    pattern: '/api/invoices',               handler: invoicesListHandler,       auth: 'session' },
  { method: 'POST',   pattern: '/api/invoices',               handler: invoicesCreateHandler,     auth: 'session' },
  { method: 'GET',    pattern: '/api/invoices/:id',           handler: invoiceGetHandler,         auth: 'session' },
  { method: 'PUT',    pattern: '/api/invoices/:id',           handler: invoicePutHandler,         auth: 'session' },
  { method: 'DELETE', pattern: '/api/invoices/:id',           handler: invoiceDeleteHandler,      auth: 'session' },

  // Items (7 routes)
  { method: 'GET',    pattern: '/api/items/image-preview',    handler: itemImagePreviewHandler,   auth: 'session' },
  { method: 'GET',    pattern: '/api/items/enriched',         handler: itemsEnrichedHandler,      auth: 'session' },
  { method: 'POST',   pattern: '/api/items/auto-sku',         handler: itemsAutoSkuHandler,       auth: 'session' },
  { method: 'GET',    pattern: '/api/items',                  handler: itemsListHandler,          auth: 'session' },
  { method: 'GET',    pattern: '/api/items/:id',              handler: itemGetHandler,            auth: 'session' },
  { method: 'PUT',    pattern: '/api/items/:id',              handler: itemPutHandler,            auth: 'session' },
  { method: 'DELETE', pattern: '/api/items/:id',              handler: itemDeleteHandler,         auth: 'session' },

  // Sales (5 routes)
  { method: 'GET',    pattern: '/api/sales',                  handler: salesListHandler,          auth: 'session' },
  { method: 'POST',   pattern: '/api/sales',                  handler: salesCreateHandler,        auth: 'session' },
  { method: 'GET',    pattern: '/api/sales/:id',              handler: saleGetHandler,            auth: 'session' },
  { method: 'PUT',    pattern: '/api/sales/:id',              handler: salePutHandler,            auth: 'session' },
  { method: 'DELETE', pattern: '/api/sales/:id',              handler: saleDeleteHandler,         auth: 'session' },

  // Platforms (4 routes)
  { method: 'GET',    pattern: '/api/platforms',              handler: platformsListHandler,      auth: 'session' },
  { method: 'POST',   pattern: '/api/platforms',              handler: platformsCreateHandler,    auth: 'session' },
  { method: 'PUT',    pattern: '/api/platforms/:id',          handler: platformPutHandler,        auth: 'session' },
  { method: 'DELETE', pattern: '/api/platforms/:id',          handler: platformDeleteHandler,     auth: 'session' },

  // Comps & Market Comps (9 routes)
  { method: 'GET',    pattern: '/api/comps',                  handler: compsListHandler,          auth: 'session' },
  { method: 'POST',   pattern: '/api/comps',                  handler: compsCreateHandler,        auth: 'session' },
  { method: 'GET',    pattern: '/api/comps/market',           handler: marketCompsGetHandler,     auth: 'session' },
  { method: 'POST',   pattern: '/api/comps/market',           handler: marketCompsPostHandler,    auth: 'session' },
  { method: 'PUT',    pattern: '/api/comps/market/:id',       handler: marketCompsPutHandler,     auth: 'session' },
  { method: 'DELETE', pattern: '/api/comps/market/:id',       handler: marketCompsDeleteHandler,  auth: 'session' },
  { method: 'GET',    pattern: '/api/comps/:id',              handler: compGetHandler,            auth: 'session' },
  { method: 'PUT',    pattern: '/api/comps/:id',              handler: compPutHandler,            auth: 'session' },
  { method: 'DELETE', pattern: '/api/comps/:id',              handler: compDeleteHandler,         auth: 'session' },

  // Dashboard & Admin (2 routes)
  { method: 'GET',    pattern: '/api/dashboard',              handler: dashboardHandler,          auth: 'session' },
  { method: 'GET',    pattern: '/api/admin/stats',            handler: adminStatsGetHandler,      auth: 'session_admin' },

  // Batch & Amazon Import (5 routes)
  { method: 'POST',   pattern: '/api/import/batch',           handler: batchImportHandler,        auth: 'session' },
  { method: 'POST',   pattern: '/api/import/amazon',          handler: amazonImportHandler,       auth: 'bearer_or_secret' },
  { method: 'POST',   pattern: '/api/import/amazon-url',      handler: amazonUrlImportHandler,    auth: 'session' },
  { method: 'GET',    pattern: '/api/import/amazon-token',    handler: amazonTokenGetHandler,     auth: 'session' },
  { method: 'POST',   pattern: '/api/import/amazon-token',    handler: amazonTokenPostHandler,    auth: 'session' },

  // Sync & Reports (6 routes)
  { method: 'GET',    pattern: '/api/sync/finance',           handler: syncFinanceGetHandler,     auth: 'session' },
  { method: 'POST',   pattern: '/api/sync/finance',           handler: syncFinancePostHandler,    auth: 'session' },
  { method: 'GET',    pattern: '/api/reports/tax',            handler: taxReportGetHandler,       auth: 'session' },
  { method: 'GET',    pattern: '/api/market-alerts',          handler: marketAlertsGetHandler,    auth: 'session' },
  { method: 'POST',   pattern: '/api/market-alerts/refresh-all', handler: marketAlertsPostHandler, auth: 'session' },
  { method: 'PUT',    pattern: '/api/market-alerts/:id',      handler: marketAlertsPutHandler,    auth: 'session' },

  // eBay Operations & Analytics (11 routes)
  { method: 'GET',    pattern: '/api/ebay/oauth-status',      handler: ebayOAuthStatusHandler,    auth: 'session' },
  { method: 'GET',    pattern: '/api/ebay/find-listings',     handler: ebayFindListingsHandler,   auth: 'session' },
  { method: 'GET',    pattern: '/api/ebay/active-listings',   handler: ebayActiveListingsHandler, auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/sync-item',         handler: ebaySyncItemHandler,       auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/sync-all',          handler: ebaySyncAllHandler,        auth: 'session' },
  { method: 'GET',    pattern: '/api/ebay/match-sold-vinescout', handler: matchSoldVinescoutGetHandler, auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/match-sold-vinescout', handler: matchSoldVinescoutPostHandler, auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/push-sku',          handler: ebayPushSkuHandler,        auth: 'session' },
  { method: 'GET',    pattern: '/api/ebay/analytics',         handler: ebayAnalyticsHandler,      auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/analytics/ingest-traffic', handler: ebayAnalyticsIngestHandler, auth: 'session' },
  { method: 'POST',   pattern: '/api/ebay/reconcile',         handler: ebayReconcileHandler,      auth: 'session' },

  // Export & VineScout Sync (7 routes)
  { method: 'GET',    pattern: '/api/export/vinescout-sales', handler: vinescoutSalesExportHandler, auth: 'bearer_or_secret' },
  { method: 'GET',    pattern: '/api/export/vinescout-inventory', handler: vinescoutInventoryExportHandler, auth: 'bearer_or_secret' },
  { method: 'GET',    pattern: '/api/sync/vinescout-catalog', handler: vinescoutCatalogHandler,   auth: 'session' },
  { method: 'POST',   pattern: '/api/sync/vinescout-catalog', handler: vinescoutCatalogPostHandler, auth: 'session' },
  { method: 'GET',    pattern: '/api/sync/settings',          handler: syncSettingsGetHandler,    auth: 'session' },
  { method: 'PUT',    pattern: '/api/sync/settings',          handler: syncSettingsPutHandler,    auth: 'session' },
  { method: 'POST',   pattern: '/api/sync/item',              handler: amazonImportHandler,       auth: 'bearer_or_secret' },

  // API Integrations (4 routes)
  { method: 'GET',    pattern: '/api/integrations',           handler: integrationsListHandler,   auth: 'session' },
  { method: 'POST',   pattern: '/api/integrations',           handler: integrationsCreateHandler, auth: 'session' },
  { method: 'POST',   pattern: '/api/integrations/:id/revoke', handler: integrationRevokeHandler, auth: 'session' },
  { method: 'DELETE', pattern: '/api/integrations/:id',       handler: integrationDeleteHandler,  auth: 'session' }
];

export function compileRoute(entry) {
  const method = entry.method.toUpperCase();
  const pattern = entry.pattern;
  const segments = pattern.split('/').filter(Boolean);
  const paramNames = [];
  let staticCount = 0;
  let dynamicCount = 0;

  for (const seg of segments) {
    if (seg.startsWith(':')) {
      dynamicCount++;
      paramNames.push(seg.slice(1).replace(/\?$/, ''));
    } else {
      staticCount++;
    }
  }

  let regex;
  if (pattern === '/api/integrations/:id/revoke') {
    // Supports both /api/integrations/:id/revoke and /api/integrations/revoke
    regex = /^\/api\/integrations(?:\/([^/]+))?\/revoke$/;
  } else {
    const regexPattern = pattern
      .replace(/\/+/g, '/')
      .replace(/:([a-zA-Z0-9_]+)/g, '([^/]+)');
    regex = new RegExp(`^${regexPattern}$`);
  }

  return {
    method,
    pattern,
    handler: entry.handler,
    auth: entry.auth || 'session',
    paramNames,
    staticCount,
    dynamicCount,
    totalCount: segments.length,
    regex
  };
}

export function sortRoutes(routes) {
  return [...routes].sort((a, b) => {
    // 1. More static segments first
    if (b.staticCount !== a.staticCount) {
      return b.staticCount - a.staticCount;
    }
    // 2. Fewer dynamic segments first
    if (a.dynamicCount !== b.dynamicCount) {
      return a.dynamicCount - b.dynamicCount;
    }
    // 3. More total segments first
    if (b.totalCount !== a.totalCount) {
      return b.totalCount - a.totalCount;
    }
    // 4. Stable alphabetical tie-breaker
    return a.pattern.localeCompare(b.pattern);
  });
}

export function assertNoShadowedRoutes(compiledRoutes) {
  for (let i = 0; i < compiledRoutes.length; i++) {
    const target = compiledRoutes[i];
    const probePath = target.pattern.replace(/:([a-zA-Z0-9_]+)/g, '__probe_id__');

    for (let j = 0; j < i; j++) {
      const prev = compiledRoutes[j];
      if (prev.method !== target.method) continue;

      if (prev.pattern === target.pattern) {
        throw new Error(`Duplicate route registration: [${target.method} ${target.pattern}]`);
      }

      // If target is static, check if prev regex matches target's exact static pattern
      if (target.dynamicCount === 0 && prev.regex.test(target.pattern)) {
        throw new Error(`Route shadowing detected: [${prev.method} ${prev.pattern}] shadows [${target.method} ${target.pattern}]`);
      }

      // If both dynamic, check probePath collision
      if (target.dynamicCount > 0 && prev.dynamicCount > 0 && prev.regex.test(probePath)) {
        throw new Error(`Route collision detected: [${prev.method} ${prev.pattern}] conflicts with [${target.method} ${target.pattern}]`);
      }
    }
  }
}

// Compile, sort, and validate route table at module load scope
export const COMPILED_ROUTES = sortRoutes(ROUTES.map(compileRoute));
assertNoShadowedRoutes(COMPILED_ROUTES);

export const ROUTE_MANIFEST = COMPILED_ROUTES.map(r => ({
  method: r.method,
  pattern: r.pattern,
  auth: r.auth
}));

export function matchRoute(method, pathname) {
  const normMethod = (method || '').toUpperCase();
  const pathMatches = [];

  for (const route of COMPILED_ROUTES) {
    const match = route.regex.exec(pathname);
    if (match) {
      pathMatches.push({ route, match });
    }
  }

  if (pathMatches.length === 0) {
    return { handler: null, params: {}, methodNotAllowed: false, allowedMethods: [] };
  }

  const methodMatch = pathMatches.find(m => m.route.method === normMethod);
  if (methodMatch) {
    const { route, match } = methodMatch;
    const params = {};
    if (route.paramNames && route.paramNames.length > 0) {
      for (let i = 0; i < route.paramNames.length; i++) {
        params[route.paramNames[i]] = match[i + 1] !== undefined ? decodeURIComponent(match[i + 1]) : undefined;
      }
    }
    return {
      handler: route.handler,
      params,
      route,
      methodNotAllowed: false,
      allowedMethods: []
    };
  }

  const allowedMethods = [...new Set(pathMatches.map(m => m.route.method))].sort();
  return {
    handler: null,
    params: {},
    methodNotAllowed: true,
    allowedMethods
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const correlationId = request.headers.get('x-correlation-id') || crypto.randomUUID();
    const context = { request, env, ctx, correlationId };
    request.correlationId = correlationId;

    const hostHeader = request.headers.get('host') || request.headers.get('Host') || '';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || hostHeader.includes('localhost') || hostHeader.includes('127.0.0.1');
    const requestOrigin = request.headers.get('Origin') || '';
    const nonce = base64UrlEncodeBytes(crypto.getRandomValues(new Uint8Array(16)));
    if (!isLocalhost && (url.protocol === 'http:' || request.headers.get('x-forwarded-proto') === 'http')) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // Redirect non-canonical case (/Outpost, /OUTPOST, /auction) to lowercase /outpost
    if (/^\/(outpost|auction)($|\/|\?)/i.test(url.pathname)) {
      if (!url.pathname.startsWith('/outpost')) {
        const canonicalUrl = new URL(request.url);
        canonicalUrl.pathname = canonicalUrl.pathname.replace(/^\/(outpost|auction)/i, '/outpost');
        return Response.redirect(canonicalUrl.toString(), 301);
      }
    }

    if (request.method === 'OPTIONS') {
      return addSecurityHeaders(new Response(null, { status: 204 }), isLocalhost, requestOrigin, nonce);
    }

    let response;
    try {
      // Normalize /outpost/api/* or /auction/api/* -> /api/*
      let apiPath = url.pathname;
      if (apiPath.startsWith('/outpost/api/')) {
        apiPath = apiPath.slice('/outpost'.length);
      } else if (apiPath === '/outpost/api') {
        apiPath = '/api';
      } else if (apiPath.startsWith('/auction/api/')) {
        apiPath = apiPath.slice('/auction'.length);
      } else if (apiPath === '/auction/api') {
        apiPath = '/api';
      }

      if (apiPath === '/api' || apiPath.startsWith('/api/')) {
        const routeMatch = matchRoute(request.method, apiPath);
        if (routeMatch.handler) {
          context.params = routeMatch.params;
          response = await routeMatch.handler(context);
        } else if (routeMatch.methodNotAllowed) {
          response = new Response(JSON.stringify({
            error: `Method ${request.method} not allowed for ${apiPath}. Allowed: ${routeMatch.allowedMethods.join(', ')}`
          }), {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': routeMatch.allowedMethods.join(', ')
            }
          });
        } else {
          response = new Response(JSON.stringify({ error: 'Endpoint not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else if (url.pathname.startsWith('/outpost/assets/')) {
        // Rewrite asset requests: /outpost/assets/ -> /assets/
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice('/outpost'.length);
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request))
          : await fetch(new Request(assetUrl.toString(), request));
        if (response && response.headers.get('content-type')?.includes('text/html')) {
          response = new Response('Asset not found', {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          });
        }
      } else if (url.pathname.startsWith('/outpost/') && /\.[a-zA-Z0-9]+$/.test(url.pathname)) {
        // Direct static asset requests: /outpost/favicon.svg -> /favicon.svg
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice('/outpost'.length);
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request))
          : await fetch(new Request(assetUrl.toString(), request));
        if (response && response.headers.get('content-type')?.includes('text/html')) {
          response = new Response('Asset not found', {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          });
        }
      } else if (url.pathname === '/outpost' || url.pathname.startsWith('/outpost/')) {
        // SPA fallback - serve index.html for all /outpost/* routes
        const spaUrl = new URL(request.url);
        spaUrl.pathname = '/';
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(new Request(spaUrl.toString(), request))
          : await fetch(new Request(spaUrl.toString(), request));
      } else if (url.pathname.startsWith('/auction/assets/')) {
        // Rewrite legacy asset requests: /auction/assets/ -> /assets/
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice('/auction'.length);
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request))
          : await fetch(new Request(assetUrl.toString(), request));
        if (response && response.headers.get('content-type')?.includes('text/html')) {
          response = new Response('Asset not found', {
            status: 404,
            statusText: 'Not Found',
            headers: {
              'Content-Type': 'text/plain',
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
          });
        }
      } else if (url.pathname === '/auction' || url.pathname.startsWith('/auction/')) {
        // SPA fallback for legacy /auction/* routes -> redirect to /outpost
        const outpostUrl = new URL(request.url);
        outpostUrl.pathname = outpostUrl.pathname.replace(/^\/auction/, '/outpost');
        return Response.redirect(outpostUrl.toString(), 301);
      } else {
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(request)
          : await fetch(request);
      }
    } catch (err) {
      console.error(`[worker][${correlationId}] unhandled error:`, err && err.stack ? err.stack : err);
      response = new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.', correlationId }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId
        }
      });
    }

    if (response && response.status >= 500) {
      console.error(`[worker][${correlationId}] 5xx response (${response.status}) returned for ${request.method} ${url.pathname}`);
      const headers = new Headers(response.headers);
      headers.set('X-Correlation-Id', correlationId);
      const contentType = headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          const bodyJson = await response.json();
          if (bodyJson && typeof bodyJson === 'object' && !bodyJson.correlationId) {
            bodyJson.correlationId = correlationId;
          }
          response = new Response(JSON.stringify(bodyJson), {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        } catch (_) {
          response = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers
          });
        }
      } else {
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }
    }

    return addSecurityHeaders(response, isLocalhost, requestOrigin, nonce);
  }
};

export { addSecurityHeaders };
