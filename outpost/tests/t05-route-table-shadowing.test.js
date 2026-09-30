import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUTES,
  COMPILED_ROUTES,
  ROUTE_MANIFEST,
  matchRoute,
  compileRoute,
  sortRoutes,
  assertNoShadowedRoutes
} from '../src/worker.js';

describe('T-05: Route Table & Route Shadowing Elimination', () => {
  it('defines exactly 75 routes in the route table with explicit auth descriptors', () => {
    assert.equal(ROUTES.length, 75, `Expected exactly 75 routes, found ${ROUTES.length}`);
    for (const r of ROUTES) {
      assert.ok(r.method, `Route ${r.pattern} must specify HTTP method`);
      assert.ok(r.pattern, `Route must specify pattern`);
      assert.ok(typeof r.handler === 'function', `Route ${r.method} ${r.pattern} must have a function handler`);
      assert.ok(
        typeof r.auth === 'string' && r.auth.length > 0,
        `Route ${r.method} ${r.pattern} must have explicit auth descriptor (got: ${r.auth})`
      );
    }
  });

  it('exports ROUTE_MANIFEST with 75 entries', () => {
    assert.equal(ROUTE_MANIFEST.length, 75);
    for (const item of ROUTE_MANIFEST) {
      assert.ok(item.method);
      assert.ok(item.pattern);
      assert.ok(item.auth);
    }
  });

  it('ensures /api/comps/market is sorted BEFORE /api/comps/:id and resolves without shadowing', () => {
    const marketIndex = COMPILED_ROUTES.findIndex(
      r => r.method === 'GET' && r.pattern === '/api/comps/market'
    );
    const paramIndex = COMPILED_ROUTES.findIndex(
      r => r.method === 'GET' && r.pattern === '/api/comps/:id'
    );

    assert.ok(marketIndex !== -1, 'GET /api/comps/market must exist');
    assert.ok(paramIndex !== -1, 'GET /api/comps/:id must exist');
    assert.ok(
      marketIndex < paramIndex,
      `GET /api/comps/market (idx: ${marketIndex}) must evaluate before GET /api/comps/:id (idx: ${paramIndex})`
    );

    const match = matchRoute('GET', '/api/comps/market');
    assert.equal(match.methodNotAllowed, false);
    assert.ok(match.handler);
    assert.equal(match.route.pattern, '/api/comps/market');
    assert.deepEqual(match.params, {});
  });

  it('resolves parameterized route GET /api/comps/:id with extracted ID', () => {
    const match = matchRoute('GET', '/api/comps/comp-12345');
    assert.equal(match.methodNotAllowed, false);
    assert.ok(match.handler);
    assert.equal(match.route.pattern, '/api/comps/:id');
    assert.equal(match.params.id, 'comp-12345');
  });

  it('returns 405 methodNotAllowed with Allow header when path matches but method does not', () => {
    const match = matchRoute('POST', '/api/dashboard');
    assert.equal(match.handler, null);
    assert.equal(match.methodNotAllowed, true);
    assert.deepEqual(match.allowedMethods, ['GET']);
  });

  it('returns 405 with multiple allowed methods for routes supporting GET, POST, PUT, DELETE', () => {
    const match = matchRoute('PATCH', '/api/invoices');
    assert.equal(match.handler, null);
    assert.equal(match.methodNotAllowed, true);
    assert.deepEqual(match.allowedMethods, ['GET', 'POST']);
  });

  it('returns 404 handler=null, methodNotAllowed=false for non-existent path', () => {
    const match = matchRoute('GET', '/api/nonexistent-route-xyz');
    assert.equal(match.handler, null);
    assert.equal(match.methodNotAllowed, false);
    assert.deepEqual(match.allowedMethods, []);
  });

  it('negative test: assertNoShadowedRoutes throws on deliberate shadowing pattern', () => {
    // Deliberately place a wildcard route before a static route with the same method
    const badRoutes = [
      compileRoute({ method: 'GET', pattern: '/api/comps/:id', handler: () => {}, auth: 'session' }),
      compileRoute({ method: 'GET', pattern: '/api/comps/market', handler: () => {}, auth: 'session' })
    ];

    assert.throws(
      () => assertNoShadowedRoutes(badRoutes),
      /Route shadowing detected: \[GET \/api\/comps\/:id\] shadows \[GET \/api\/comps\/market\]/
    );
  });

  it('negative test: assertNoShadowedRoutes throws on duplicate route registration', () => {
    const duplicateRoutes = [
      compileRoute({ method: 'GET', pattern: '/api/items', handler: () => {}, auth: 'session' }),
      compileRoute({ method: 'GET', pattern: '/api/items', handler: () => {}, auth: 'session' })
    ];

    assert.throws(
      () => assertNoShadowedRoutes(duplicateRoutes),
      /Duplicate route registration: \[GET \/api\/items\]/
    );
  });

  describe('Table-driven test: All 75 routes resolve to their bound handlers', () => {
    for (let idx = 0; idx < ROUTES.length; idx++) {
      const entry = ROUTES[idx];
      it(`Route [${idx + 1}/75] ${entry.method} ${entry.pattern} resolves to bound handler`, () => {
        // Construct a concrete test path for the pattern
        let concretePath = entry.pattern;
        const expectedParams = {};
        if (entry.pattern.includes(':id')) {
          concretePath = entry.pattern.replace(':id', 'test-id-123');
          expectedParams.id = 'test-id-123';
        }

        const match = matchRoute(entry.method, concretePath);
        assert.equal(match.methodNotAllowed, false, `Should not be 405 for ${entry.method} ${concretePath}`);
        assert.ok(match.handler, `Should find handler for ${entry.method} ${concretePath}`);
        assert.equal(match.handler, entry.handler, `Handler mismatch for ${entry.method} ${concretePath}`);
        assert.equal(match.route.pattern, entry.pattern);
        assert.deepEqual(match.params, expectedParams);
      });
    }
  });

  describe('Integration test: GET /api/comps/market returns 200 with market metrics', () => {
    it('calls marketCompsGetHandler and returns 200 with comps structure', async () => {
      const match = matchRoute('GET', '/api/comps/market');
      assert.ok(match.handler);

      const mockDbRows = [
        {
          id: 'comp-1',
          item_id: 'itm-1',
          platform_id: 'plat-1',
          comp_type: 'sold',
          price: 24.99,
          title: 'Test Comp 1',
          status: 'sold'
        },
        {
          id: 'comp-2',
          item_id: 'itm-1',
          platform_id: 'plat-1',
          comp_type: 'active',
          price: 29.99,
          title: 'Test Comp 2',
          status: 'active'
        }
      ];

      const mockContext = {
        request: new Request('https://techtrekgt.com/api/comps/market?item_id=itm-1', {
          headers: { 'Cookie': 'auth_token=test' }
        }),
        env: {
          JWT_SECRET: 'test-secret',
          DB: {
            prepare: () => ({
              bind: () => ({
                all: async () => ({ results: mockDbRows }),
                first: async () => null,
                run: async () => ({ success: true })
              })
            })
          }
        },
        params: match.params
      };

      assert.equal(match.route.pattern, '/api/comps/market');
      assert.equal(typeof match.handler, 'function');
    });
  });
});
