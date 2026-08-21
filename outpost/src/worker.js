import { onRequestPost as registerHandler }      from '../functions/api/auth/register.js';
import { onRequestPost as loginHandler }         from '../functions/api/auth/login.js';
import { onRequestGet  as meHandler }            from '../functions/api/auth/me.js';
import { onRequestPost as logoutHandler }        from '../functions/api/auth/logout.js';
import { onRequestPost as forgotPasswordHandler } from '../functions/api/auth/forgot-password.js';
import { onRequestPost as resetPasswordHandler }  from '../functions/api/auth/reset-password.js';
import { onRequestPost as securityQuestionHandler } from '../functions/api/auth/security-question.js';
import { onRequestPost as updateProfileHandler }  from '../functions/api/auth/update-profile.js';
import { onRequestGet as invoicesListHandler, onRequestPost as invoicesCreateHandler } from '../functions/api/invoices/index.js';
import { onRequestGet as invoiceGetHandler, onRequestPut as invoicePutHandler, onRequestDelete as invoiceDeleteHandler } from '../functions/api/invoices/[id].js';
import { onRequestGet as itemsListHandler } from '../functions/api/items/index.js';
import { onRequestGet as itemGetHandler, onRequestPut as itemPutHandler, onRequestDelete as itemDeleteHandler } from '../functions/api/items/[id].js';
import { onRequestGet as salesListHandler, onRequestPost as salesCreateHandler } from '../functions/api/sales/index.js';
import { onRequestGet as saleGetHandler, onRequestPut as salePutHandler, onRequestDelete as saleDeleteHandler } from '../functions/api/sales/[id].js';
import { onRequestGet as platformsListHandler, onRequestPost as platformsCreateHandler } from '../functions/api/platforms/index.js';
import { onRequestPut as platformPutHandler, onRequestDelete as platformDeleteHandler } from '../functions/api/platforms/[id].js';
import { onRequestGet as compsListHandler, onRequestPost as compsCreateHandler } from '../functions/api/comps/index.js';
import { onRequestGet as compGetHandler, onRequestPut as compPutHandler, onRequestDelete as compDeleteHandler } from '../functions/api/comps/[id].js';
import { onRequestGet as compsLiveGetHandler, onRequestPost as compsLivePostHandler } from '../functions/api/comps/live.js';
import { onRequestGet as dashboardHandler } from '../functions/api/dashboard.js';
import { onRequestPost as batchImportHandler } from '../functions/api/import/batch.js';
import { onRequestPost as amazonImportHandler } from '../functions/api/import/amazon.js';
import { onRequestGet as amazonTokenGetHandler, onRequestPost as amazonTokenPostHandler } from '../functions/api/import/amazon-token.js';
import { onRequestPost as amazonFetchHandler } from '../functions/api/import/amazon-fetch.js';
import { onRequestGet as syncFinanceGetHandler, onRequestPost as syncFinancePostHandler } from '../functions/api/sync/finance.js';
import { onRequestGet as suppliesListHandler, onRequestPost as suppliesCreateHandler } from '../functions/api/supplies/index.js';
import { onRequestPut as supplyPutHandler, onRequestDelete as supplyDeleteHandler } from '../functions/api/supplies/[id].js';
import { onRequestGet as taxReportGetHandler } from '../functions/api/reports/tax.js';

function addSecurityHeaders(response, isLocalhost = false, requestOrigin = '') {
  const newHeaders = new Headers(response.headers);
  if (!isLocalhost) {
    newHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    newHeaders.set('Content-Security-Policy', [
      "default-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https://techtrekgt.com",
      "img-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
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
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  newHeaders.set('Access-Control-Allow-Credentials', 'true');
  newHeaders.set('Access-Control-Max-Age', '86400');

  const contentType = newHeaders.get('content-type') || '';
  if (contentType.includes('text/html')) {
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, ctx };

    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const requestOrigin = request.headers.get('Origin') || '';
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
      return addSecurityHeaders(new Response(null, { status: 204 }), isLocalhost, requestOrigin);
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

      if (apiPath === '/api/auth/register' && request.method === 'POST') {
        response = await registerHandler(context);
      } else if (apiPath === '/api/auth/login' && request.method === 'POST') {
        response = await loginHandler(context);
      } else if (apiPath === '/api/auth/forgot-password' && request.method === 'POST') {
        response = await forgotPasswordHandler(context);
      } else if (apiPath === '/api/auth/reset-password' && request.method === 'POST') {
        response = await resetPasswordHandler(context);
      } else if (apiPath === '/api/auth/security-question' && request.method === 'POST') {
        response = await securityQuestionHandler(context);
      } else if (apiPath === '/api/auth/update-profile' && request.method === 'POST') {
        response = await updateProfileHandler(context);
      } else if (apiPath === '/api/auth/me' && request.method === 'GET') {
        response = await meHandler(context);
      } else if (apiPath === '/api/auth/logout' && request.method === 'POST') {
        response = await logoutHandler(context);
      // --- Invoices ---
      } else if (apiPath === '/api/invoices' && request.method === 'GET') {
        response = await invoicesListHandler(context);
      } else if (apiPath === '/api/invoices' && request.method === 'POST') {
        response = await invoicesCreateHandler(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === 'GET') {
        response = await invoiceGetHandler(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
        response = await invoicePutHandler(context);
      } else if (/^\/api\/invoices\/[^/]+$/.test(apiPath) && request.method === 'DELETE') {
        response = await invoiceDeleteHandler(context);
      // --- Items ---
      } else if (apiPath === '/api/items' && request.method === 'GET') {
        response = await itemsListHandler(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === 'GET') {
        response = await itemGetHandler(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
        response = await itemPutHandler(context);
      } else if (/^\/api\/items\/[^/]+$/.test(apiPath) && request.method === 'DELETE') {
        response = await itemDeleteHandler(context);
      // --- Sales ---
      } else if (apiPath === '/api/sales' && request.method === 'GET') {
        response = await salesListHandler(context);
      } else if (apiPath === '/api/sales' && request.method === 'POST') {
        response = await salesCreateHandler(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === 'GET') {
        response = await saleGetHandler(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
        response = await salePutHandler(context);
      } else if (/^\/api\/sales\/[^/]+$/.test(apiPath) && request.method === 'DELETE') {
        response = await saleDeleteHandler(context);
      // --- Platforms ---
      } else if (apiPath === '/api/platforms' && request.method === 'GET') {
        response = await platformsListHandler(context);
      } else if (apiPath === '/api/platforms' && request.method === 'POST') {
        response = await platformsCreateHandler(context);
      } else if (/^\/api\/platforms\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
        response = await platformPutHandler(context);
      } else if (/^\/api\/platforms\/[^/]+$/.test(apiPath) && request.method === 'DELETE') {
        response = await platformDeleteHandler(context);
      // --- Comps / Pricing Intelligence ---
      } else if (apiPath === '/api/comps/live' && request.method === 'GET') {
        response = await compsLiveGetHandler(context);
      } else if (apiPath === '/api/comps/live' && request.method === 'POST') {
        response = await compsLivePostHandler(context);
      } else if (apiPath === '/api/comps' && request.method === 'GET') {
        response = await compsListHandler(context);
      } else if (apiPath === '/api/comps' && request.method === 'POST') {
        response = await compsCreateHandler(context);
      } else if (/^\/api\/comps\/[^/]+$/.test(apiPath) && request.method === 'GET') {
        response = await compGetHandler(context);
      } else if (/^\/api\/comps\/[^/]+$/.test(apiPath) && request.method === 'PUT') {
        response = await compPutHandler(context);
      } else if (/^\/api\/comps\/[^/]+$/.test(apiPath) && request.method === 'DELETE') {
        response = await compDeleteHandler(context);
      // --- Dashboard ---
      } else if (apiPath === '/api/dashboard' && request.method === 'GET') {
        response = await dashboardHandler(context);
      // --- Batch Import ---
      } else if (apiPath === '/api/import/batch' && request.method === 'POST') {
        response = await batchImportHandler(context);
      // --- Amazon / VineScout Import ---
      } else if (apiPath === '/api/import/amazon' && request.method === 'POST') {
        response = await amazonImportHandler(context);
      } else if (apiPath === '/api/import/amazon-token' && request.method === 'GET') {
        response = await amazonTokenGetHandler(context);
      } else if (apiPath === '/api/import/amazon-token' && request.method === 'POST') {
        response = await amazonTokenPostHandler(context);
      } else if (apiPath === '/api/import/amazon-fetch' && request.method === 'POST') {
        response = await amazonFetchHandler(context);
      // --- TechTrek Finance Sync ---
      } else if (apiPath === '/api/sync/finance' && request.method === 'GET') {
        response = await syncFinanceGetHandler(context);
      } else if (apiPath === '/api/sync/finance' && request.method === 'POST') {
        response = await syncFinancePostHandler(context);
      // --- Supplies Expense Tracker ---
      } else if (apiPath === '/api/supplies' && request.method === 'GET') {
        response = await suppliesListHandler(context);
      } else if (apiPath === '/api/supplies' && request.method === 'POST') {
        response = await suppliesCreateHandler(context);
      } else if (apiPath.match(/^\/api\/supplies\/[^/]+$/) && request.method === 'PUT') {
        const id = apiPath.split('/')[3];
        response = await supplyPutHandler({ ...context, params: { id } });
      } else if (apiPath.match(/^\/api\/supplies\/[^/]+$/) && request.method === 'DELETE') {
        const id = apiPath.split('/')[3];
        response = await supplyDeleteHandler({ ...context, params: { id } });
      // --- Year-End Tax & Schedule C Reports ---
      } else if (apiPath === '/api/reports/tax' && request.method === 'GET') {
        response = await taxReportGetHandler(context);
      } else if (apiPath.startsWith('/api/')) {
        response = new Response(JSON.stringify({ error: 'Endpoint not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (url.pathname.startsWith('/outpost/assets/')) {
        // Rewrite asset requests: /outpost/assets/ -> /assets/
        const assetUrl = new URL(request.url);
        assetUrl.pathname = assetUrl.pathname.slice('/outpost'.length);
        response = env?.ASSETS?.fetch
          ? await env.ASSETS.fetch(new Request(assetUrl.toString(), request))
          : await fetch(new Request(assetUrl.toString(), request));
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
      const errorMessage = err instanceof Error ? err.message : String(err || 'Server error');
      response = new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return addSecurityHeaders(response, isLocalhost, requestOrigin);
  }
};
