import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultSchemaPath = path.resolve(__dirname, '../../schema.sql');

/**
 * Creates an in-memory Cloudflare D1 mock powered by Node 24 DatabaseSync.
 *
 * @param {Object} [options]
 * @param {string} [options.schemaSql]
 * @returns {Object} Mock D1 instance
 */
export function createMockD1(options = {}) {
  const schemaSql = options.schemaSql || fs.readFileSync(defaultSchemaPath, 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(schemaSql);

  const queryLog = [];
  let failureHook = null;

  const mock = {
    _raw: db,
    queryLog,
    setFailureHook(hook) {
      failureHook = hook;
    },
    clearFailureHook() {
      failureHook = null;
    },
    prepare(sql) {
      let boundParams = [];
      const stmt = {
        sql,
        getBoundParams() {
          return boundParams;
        },
        bind(...params) {
          boundParams = params;
          return this;
        },
        async first() {
          queryLog.push({ sql, params: boundParams, type: 'first' });
          if (failureHook && failureHook(sql, boundParams)) {
            throw new Error(`Injected D1 Failure for query: ${sql}`);
          }
          const row = db.prepare(sql).get(...boundParams);
          return row || null;
        },
        async all() {
          queryLog.push({ sql, params: boundParams, type: 'all' });
          if (failureHook && failureHook(sql, boundParams)) {
            throw new Error(`Injected D1 Failure for query: ${sql}`);
          }
          const results = db.prepare(sql).all(...boundParams);
          return { results: results || [] };
        },
        async run() {
          queryLog.push({ sql, params: boundParams, type: 'run' });
          if (failureHook && failureHook(sql, boundParams)) {
            throw new Error(`Injected D1 Failure for query: ${sql}`);
          }
          const info = db.prepare(sql).run(...boundParams);
          return {
            success: true,
            meta: {
              changes: info.changes,
              last_row_id: info.lastInsertRowid
            },
            changes: info.changes
          };
        }
      };
      return stmt;
    },
    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    }
  };

  return mock;
}
