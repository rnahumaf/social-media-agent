const { randomUUID } = require("node:crypto");

// A cancellation belongs to one operation, never to a stale global controller.
class OperationManager {
  #active = null;
  begin(name, projectId, cancellable = false) {
    if (this.#active) throw Error("Aguarde a operação atual ou cancele-a.");
    const operation = {
      id: randomUUID(), name, projectId: projectId || null,
      startedAt: new Date().toISOString(), cancellable,
      controller: cancellable ? new AbortController() : null,
    };
    this.#active = operation;
    return operation.id;
  }
  get signal() { return this.#active?.controller?.signal; }
  snapshot() {
    if (!this.#active) return null;
    const { controller, ...operation } = this.#active;
    return { ...operation, cancelRequested: !!controller?.signal.aborted };
  }
  cancel(id) {
    if (!this.#active || this.#active.id !== id)
      throw Error("Esta operação já terminou. Atualize o estado antes de cancelar.");
    if (!this.#active.cancellable)
      throw Error("Esta operação não pode ser interrompida.");
    const reason = new Error("Operação cancelada.");
    reason.name = "AbortError";
    this.#active.controller.abort(reason);
    return true;
  }
  finish(id) {
    if (this.#active?.id === id) this.#active = null;
  }
}
module.exports = { OperationManager };
