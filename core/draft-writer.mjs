/** Coalesces rapid edits and serializes writes; navigation waits for the latest edit. */
export function createDraftWriter(write, delay = 600) {
  const pending = new Map(),
    listeners = new Set();
  let timer,
    running = null,
    status = { pending: false, saving: false, error: "" };
  const notify = (error = "") => {
    status = { pending: !!pending.size || !!running, saving: !!running, error };
    for (const listener of listeners) listener();
  };
  function schedule(payload) {
    pending.set(payload.id, structuredClone(payload));
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush().catch(() => {});
    }, delay);
    notify();
  }
  async function flush() {
    clearTimeout(timer);
    if (running) {
      await running;
      if (pending.size) return flush();
      return;
    }
    if (!pending.size) return;
    // Yield before processing so running is visible even for synchronous mock writers.
    running = Promise.resolve().then(async () => {
      while (pending.size) {
        const [id, payload] = pending.entries().next().value;
        pending.delete(id);
        try {
          await write(payload);
        } catch (error) {
          if (!pending.has(id)) pending.set(id, payload);
          throw error;
        }
      }
    });
    notify();
    try {
      await running;
      running = null;
      notify();
    } catch (error) {
      running = null;
      notify(error.message || "Não foi possível salvar o rascunho.");
      throw error;
    }
  }
  return {
    schedule,
    flush,
    getSnapshot: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
