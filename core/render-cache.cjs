const crypto = require("node:crypto");
/** Bounded LRU with in-flight deduplication. Failed renders are never cached. */
function createRenderCache({
  maxBytes = 32 * 1024 * 1024,
  maxEntries = 120,
} = {}) {
  const entries = new Map(),
    pending = new Map();
  let bytes = 0;
  return {
    async get(key, render) {
      if (entries.has(key)) {
        const result = entries.get(key);
        entries.delete(key);
        entries.set(key, result);
        return result;
      }
      if (pending.has(key)) return pending.get(key);
      const task = Promise.resolve()
        .then(render)
        .then((result) => {
          if (result.length <= maxBytes) {
            entries.set(key, result);
            bytes += result.length;
            while (bytes > maxBytes || entries.size > maxEntries) {
              const oldest = entries.keys().next().value;
              bytes -= entries.get(oldest).length;
              entries.delete(oldest);
            }
          }
          return result;
        })
        .finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
    get size() {
      return entries.size;
    },
    get bytes() {
      return bytes;
    },
  };
}
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
module.exports = { createRenderCache, digest };
