const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createRememberedVaults,
  workspaceKey,
} = require("../electron/remembered-vaults.cjs");

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remembered-vaults-"));
  const safeStorage = {
    isAsyncEncryptionAvailable: async () => true,
    encryptStringAsync: async (value) =>
      Buffer.from(`protected:${value}`, "utf8"),
    decryptStringAsync: async (value) => ({
      result: value.toString("utf8").replace(/^protected:/, ""),
      shouldReEncrypt: false,
    }),
  };
  return {
    dir,
    file: path.join(dir, "remembered-vaults.json"),
    safeStorage,
  };
}

test("guarda a senha protegida por workspace sem salvar caminho ou texto puro", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  const vaults = createRememberedVaults(f);
  const workspace = path.join(f.dir, "workspace pessoal");

  assert.equal(await vaults.save(workspace, "uma-senha-longa"), true);
  assert.equal(vaults.has(workspace), true);
  assert.equal(await vaults.load(workspace), "uma-senha-longa");
  const persisted = fs.readFileSync(f.file, "utf8");
  assert.ok(!persisted.includes("uma-senha-longa"));
  assert.ok(!persisted.includes("workspace pessoal"));
  assert.ok(persisted.includes(workspaceKey(workspace)));
  assert.equal(await vaults.load(path.join(f.dir, "outro")), null);
});

test("esquecer remove somente a credencial local daquele workspace", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  const vaults = createRememberedVaults(f);
  const first = path.join(f.dir, "first");
  const second = path.join(f.dir, "second");
  await vaults.save(first, "primeira-senha");
  await vaults.save(second, "segunda-senha");

  vaults.forget(first);
  assert.equal(vaults.has(first), false);
  assert.equal(await vaults.load(first), null);
  assert.equal(await vaults.load(second), "segunda-senha");
});

test("falha do armazenamento seguro não grava a senha", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  f.safeStorage.isAsyncEncryptionAvailable = async () => false;
  const vaults = createRememberedVaults(f);

  assert.equal(
    await vaults.save(path.join(f.dir, "workspace"), "senha"),
    false,
  );
  assert.equal(fs.existsSync(f.file), false);
});

test("entrada que não pode ser decifrada é descartada", async (t) => {
  const f = fixture();
  t.after(() => fs.rmSync(f.dir, { recursive: true, force: true }));
  const workspace = path.join(f.dir, "workspace");
  const vaults = createRememberedVaults(f);
  await vaults.save(workspace, "senha-original");
  f.safeStorage.decryptStringAsync = async () => {
    throw Error("credencial inválida");
  };

  assert.equal(await vaults.load(workspace), null);
  assert.equal(vaults.has(workspace), false);
});
