/**
 * In-memory mock for Cloudflare Workers KV Namespace.
 */
export function createMockKV() {
  const store = new Map();

  return {
    _raw: store,
    async get(key, type = 'text') {
      const item = store.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
      }
      if (type === 'json') {
        try {
          return JSON.parse(item.value);
        } catch {
          return null;
        }
      }
      return item.value;
    },
    async put(key, value, options = {}) {
      const stringVal = typeof value === 'string' ? value : JSON.stringify(value);
      const expiresAt = options.expirationTtl ? Date.now() + options.expirationTtl * 1000 : null;
      store.set(key, { value: stringVal, expiresAt });
    },
    async delete(key) {
      store.delete(key);
    },
    async clear() {
      store.clear();
    }
  };
}
