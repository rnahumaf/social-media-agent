const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function workspaceKey(dir) {
  let resolved = path.resolve(dir);
  if (process.platform === "win32") resolved = resolved.toLowerCase();
  return crypto.createHash("sha256").update(resolved).digest("hex");
}

function readStore(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (parsed?.format !== 1 || typeof parsed.entries !== "object")
      return { format: 1, entries: {} };
    return parsed;
  } catch {
    return { format: 1, entries: {} };
  }
}

function writeStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store), { mode: 0o600 });
  fs.renameSync(temp, file);
}

function createRememberedVaults({ file, safeStorage }) {
  const available = async () => {
    try {
      return await safeStorage.isAsyncEncryptionAvailable();
    } catch {
      return false;
    }
  };

  const forget = (dir) => {
    const store = readStore(file);
    const key = workspaceKey(dir);
    if (!(key in store.entries)) return;
    delete store.entries[key];
    writeStore(file, store);
  };

  const save = async (dir, password) => {
    if (!(await available())) return false;
    const encrypted = await safeStorage.encryptStringAsync(password);
    const store = readStore(file);
    store.entries[workspaceKey(dir)] = encrypted.toString("base64");
    writeStore(file, store);
    return true;
  };

  const load = async (dir) => {
    const store = readStore(file);
    const encoded = store.entries[workspaceKey(dir)];
    if (typeof encoded !== "string" || !(await available())) return null;
    try {
      const decrypted = await safeStorage.decryptStringAsync(
        Buffer.from(encoded, "base64"),
      );
      if (decrypted.shouldReEncrypt) await save(dir, decrypted.result);
      return decrypted.result;
    } catch {
      forget(dir);
      return null;
    }
  };

  return {
    has: (dir) =>
      typeof readStore(file).entries[workspaceKey(dir)] === "string",
    load,
    save,
    forget,
  };
}

module.exports = { createRememberedVaults, workspaceKey };
