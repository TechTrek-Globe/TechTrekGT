import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sessionCookies, clearedCookies } from '../functions/utils/auth.js';
import { buildAuthCookie as buildOutpostAuthCookie } from '../../outpost/functions/utils/auth.js';
import { buildAuthCookie as buildVinescoutAuthCookie } from '../../vinescout/functions/utils/auth.js';
import { buildAuthCookie as buildLandingAuthCookie } from '../../landing/src/gateway/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

describe('CRIT-002: HttpOnly Secure SameSite=Strict Cookies for Authentication', () => {

  describe('1. Cookie Security Attributes Across Applications', () => {
    test('finance sessionCookies emits HttpOnly, Secure, SameSite=Strict on auth_token', () => {
      const cookies = sessionCookies('test-jwt-token', 'test-csrf-token', 7200);
      assert.strictEqual(cookies.length, 4);

      const authCookies = cookies.filter(c => c.startsWith('auth_token='));
      assert.strictEqual(authCookies.length, 2);

      for (const cookie of authCookies) {
        assert.ok(cookie.includes('HttpOnly'), `auth_token must be HttpOnly: ${cookie}`);
        assert.ok(cookie.includes('Secure'), `auth_token must be Secure: ${cookie}`);
        assert.ok(cookie.includes('SameSite=Strict'), `auth_token must be SameSite=Strict: ${cookie}`);
        assert.ok(cookie.includes('Max-Age=7200'), `auth_token must have Max-Age: ${cookie}`);
      }
    });

    test('finance clearedCookies emits HttpOnly, Secure, SameSite=Strict, Max-Age=0', () => {
      const cookies = clearedCookies();
      assert.strictEqual(cookies.length, 6);

      const authCookies = cookies.filter(c => c.startsWith('auth_token=;'));
      assert.strictEqual(authCookies.length, 3);

      for (const cookie of authCookies) {
        assert.ok(cookie.includes('HttpOnly'), `cleared auth_token must be HttpOnly: ${cookie}`);
        assert.ok(cookie.includes('Secure'), `cleared auth_token must be Secure: ${cookie}`);
        assert.ok(cookie.includes('SameSite=Strict'), `cleared auth_token must be SameSite=Strict: ${cookie}`);
        assert.ok(cookie.includes('Max-Age=0'), `cleared auth_token must have Max-Age=0: ${cookie}`);
      }
    });

    test('outpost buildAuthCookie emits HttpOnly, Secure, SameSite=Strict', () => {
      const cookie = buildOutpostAuthCookie('test-token', 7200);
      assert.ok(cookie.includes('HttpOnly'), `outpost cookie must have HttpOnly: ${cookie}`);
      assert.ok(cookie.includes('Secure'), `outpost cookie must have Secure: ${cookie}`);
      assert.ok(cookie.includes('SameSite=Strict'), `outpost cookie must have SameSite=Strict: ${cookie}`);
    });

    test('vinescout buildAuthCookie emits HttpOnly, Secure, SameSite=Strict', () => {
      const cookie = buildVinescoutAuthCookie('test-token', 7200);
      assert.ok(cookie.includes('HttpOnly'), `vinescout cookie must have HttpOnly: ${cookie}`);
      assert.ok(cookie.includes('Secure'), `vinescout cookie must have Secure: ${cookie}`);
      assert.ok(cookie.includes('SameSite=Strict'), `vinescout cookie must have SameSite=Strict: ${cookie}`);
    });

    test('landing gateway buildAuthCookie emits HttpOnly, Secure, SameSite=Strict', () => {
      const cookie = buildLandingAuthCookie('test-token', 7200);
      assert.ok(cookie.includes('HttpOnly'), `landing gateway cookie must have HttpOnly: ${cookie}`);
      assert.ok(cookie.includes('Secure'), `landing gateway cookie must have Secure: ${cookie}`);
      assert.ok(cookie.includes('SameSite=Strict'), `landing gateway cookie must have SameSite=Strict: ${cookie}`);
    });

    test('wayfinder login and register use HttpOnly, Secure, SameSite=Strict', () => {
      const loginSrc = fs.readFileSync(path.join(rootDir, 'wayfinder/functions/api/auth/login.js'), 'utf-8');
      const regSrc = fs.readFileSync(path.join(rootDir, 'wayfinder/functions/api/auth/register.js'), 'utf-8');

      assert.ok(loginSrc.includes("'HttpOnly'"), 'wayfinder login must specify HttpOnly');
      assert.ok(loginSrc.includes("'Secure'"), 'wayfinder login must specify Secure');
      assert.ok(loginSrc.includes("'SameSite=Strict'"), 'wayfinder login must specify SameSite=Strict');

      assert.ok(regSrc.includes("'HttpOnly'"), 'wayfinder register must specify HttpOnly');
      assert.ok(regSrc.includes("'Secure'"), 'wayfinder register must specify Secure');
      assert.ok(regSrc.includes("'SameSite=Strict'"), 'wayfinder register must specify SameSite=Strict');
    });

    test('bigworm login uses HttpOnly, Secure, SameSite=Strict', () => {
      const loginSrc = fs.readFileSync(path.join(rootDir, 'bigworm/functions/api/auth/login.js'), 'utf-8');
      assert.ok(loginSrc.includes("'HttpOnly'"), 'bigworm login must specify HttpOnly');
      assert.ok(loginSrc.includes("'Secure'"), 'bigworm login must specify Secure');
      assert.ok(loginSrc.includes("'SameSite=Strict'"), 'bigworm login must specify SameSite=Strict');
    });
  });

  describe('2. Client-Side Token Storage Audit (Zero Tokens in Local/Session Storage)', () => {
    const authContextFiles = [
      'finance/src/context/AuthContext.jsx',
      'outpost/src/context/AuthContext.jsx',
      'vinescout/src/context/AuthContext.jsx',
      'wayfinder/src/context/AuthContext.jsx',
      'bigworm/src/context/AuthContext.jsx'
    ];

    for (const relPath of authContextFiles) {
      test(`AuthContext in ${relPath} stores NO authentication tokens in localStorage or sessionStorage`, () => {
        const fullPath = path.join(rootDir, relPath);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Regex patterns to check for token writes to client storage
        const tokenStorageRegex = /(?:localStorage|sessionStorage)\.setItem\s*\(\s*['"`](?:token|auth_token|authToken|jwt|session_token|access_token)['"`]/i;
        assert.strictEqual(
          tokenStorageRegex.test(content),
          false,
          `Detected token storage in client-accessible storage in ${relPath}`
        );

        // Also verify document.cookie is never written in AuthContext to store tokens
        const docCookieRegex = /document\.cookie\s*=\s*['"`]?auth_token/i;
        assert.strictEqual(
          docCookieRegex.test(content),
          false,
          `Detected direct document.cookie token write in ${relPath}`
        );
      });
    }
  });

  describe('3. Client API Utilities and Fetch Wrappers Pass Credentials', () => {
    test('finance apiFetch specifies credentials: include by default', async () => {
      const apiSrc = fs.readFileSync(path.join(rootDir, 'finance/src/utils/api.js'), 'utf-8');
      assert.ok(
        apiSrc.includes("credentials: options.credentials || 'include'") || apiSrc.includes("credentials: 'include'"),
        'finance apiFetch must default credentials to include'
      );
    });

    test('outpost auctionApi specifies credentials: include on all requests', () => {
      const auctionApiSrc = fs.readFileSync(path.join(rootDir, 'outpost/src/utils/auctionApi.js'), 'utf-8');
      assert.ok(
        auctionApiSrc.includes("credentials: 'include'"),
        'outpost auctionApi must default credentials to include'
      );
    });

    test('vinescout apiFetch specifies credentials: include on all requests', () => {
      const vinescoutApiSrc = fs.readFileSync(path.join(rootDir, 'vinescout/src/utils/api.js'), 'utf-8');
      assert.ok(
        vinescoutApiSrc.includes("credentials: 'include'"),
        'vinescout apiFetch must include credentials'
      );
    });

    test('wayfinder apiFetch specifies credentials: include on all requests', () => {
      const wayfinderApiSrc = fs.readFileSync(path.join(rootDir, 'wayfinder/src/utils/api.js'), 'utf-8');
      assert.ok(
        wayfinderApiSrc.includes("credentials: options.credentials || 'include'"),
        'wayfinder apiFetch must include credentials'
      );
    });

    test('bigworm apiFetch specifies credentials: include on all requests', () => {
      const bigwormApiSrc = fs.readFileSync(path.join(rootDir, 'bigworm/src/utils/api.js'), 'utf-8');
      assert.ok(
        bigwormApiSrc.includes("credentials: options.credentials || 'include'"),
        'bigworm apiFetch must include credentials'
      );
    });
  });

  describe('4. Initial Hydration Checks via /api/auth/me', () => {
    const apps = ['finance', 'outpost', 'vinescout', 'wayfinder', 'bigworm'];

    for (const app of apps) {
      test(`${app} implements /api/auth/me endpoint for initial session hydration`, () => {
        const mePath = path.join(rootDir, `${app}/functions/api/auth/me.js`);
        assert.ok(fs.existsSync(mePath), `${app} must have functions/api/auth/me.js`);
        const content = fs.readFileSync(mePath, 'utf-8');
        assert.ok(content.includes('onRequestGet'), `${app}/me.js must export onRequestGet`);
      });

      test(`${app} AuthContext restores session on load via /api/auth/me with smooth loading state`, () => {
        const authContextPath = path.join(rootDir, `${app}/src/context/AuthContext.jsx`);
        const content = fs.readFileSync(authContextPath, 'utf-8');
        assert.ok(
          content.includes('/api/auth/me'),
          `${app} AuthContext must query /api/auth/me on mount`
        );
        assert.ok(
          content.includes('loading') || content.includes('isLoading') || content.includes('Loading'),
          `${app} AuthContext must track loading state for initial hydration`
        );
      });
    }
  });

});
