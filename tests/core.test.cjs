const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const { svgCard } = require("../core/render.cjs");
const { wordpress, httpsBase } = require("../core/publish.cjs");
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-test-"));
  const w = await Workspace.open(path.join(root, "source"));
  t.after(() => {
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { w, root };
}
test("demo survives a workspace transfer with revisions, conversation and encrypted credentials", async (t) => {
  const { w, root } = await fixture(t);
  const p = w.create(
    "Comunicação científica",
    "Público geral",
    "science communication",
  );
  w.unlock("senha-ficticia-longa", { openrouter: "test-key-never-real" });
  await run(w, p.id);
  w.approve(p.id, "export");
  w.backup(path.join(root, "copy"));
  assert.equal(p.revisions.length, 1);
  assert.equal(p.runs.filter((r) => r.status === "completed").length, 4);
  const copy = await Workspace.open(path.join(root, "copy"));
  try {
    assert.deepEqual(copy.state, w.state);
    assert.equal(copy.secrets, null);
    assert.throws(() => copy.unlock("senha-incorreta"));
    copy.unlock("senha-ficticia-longa");
    assert.equal(copy.secrets.openrouter, "test-key-never-real");
    assertApproved(copy.project(p.id), copy.state.settings, "export");
    assert.ok(
      !fs
        .readFileSync(path.join(root, "copy", "vault.enc"), "utf8")
        .includes("test-key"),
    );
  } finally {
    copy.close();
  }
});
test("revision edits and destination changes invalidate approval", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  w.approve(p.id, "wordpress");
  assertApproved(p, w.state.settings, "wordpress");
  w.state.settings.wordpressUrl = "https://changed.example";
  assert.throws(() => assertApproved(p, w.state.settings, "wordpress"));
  w.approve(p.id, "export");
  w.revise(p.id, { ...current(p), article: "Alterado" });
  assert.equal(p.revisions.length, 2);
  assert.throws(() => assertApproved(p, w.state.settings, "export"));
});
test("exclusive workspace lock and non-empty backup protection", async (t) => {
  const { w, root } = await fixture(t);
  await assert.rejects(() => Workspace.open(w.dir), /em uso/);
  assert.throws(() => w.backup(w.dir));
  fs.mkdirSync(path.join(root, "occupied"));
  fs.writeFileSync(path.join(root, "occupied", "keep"), "keep");
  assert.throws(() => w.backup(path.join(root, "occupied")));
  assert.equal(
    fs.readFileSync(path.join(root, "occupied", "keep"), "utf8"),
    "keep",
  );
});
test("briefing corrections preserve revisions and revoke approval", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  w.approve(p.id, "export");
  w.update(p.id, {
    title: "Tema corrigido",
    brief: "Outra orientação",
    query: "new query",
  });
  assert.equal(p.revisions.length, 1);
  assert.equal(p.query, "new query");
  assert.equal(p.approval, null);
  assert.throws(() => w.update(p.id, { title: " ", brief: "", query: "" }));
});
test("cancelled generation leaves a durable explicit status", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => run(w, p.id, { signal: controller.signal }));
  assert.equal(p.status, "cancelled");
  assert.equal(p.revisions.length, 0);
});
test("render escapes markup and produces valid portrait JPEG", async () => {
  const sharp = require("sharp");
  const svg = svgCard(
    {
      title: "<script> & ciência",
      body: "Texto com acentuação, contexto e revisão.",
    },
    0,
    2,
  );
  assert.ok(!svg.includes("<script>"));
  const bytes = await sharp(Buffer.from(svg)).jpeg().toBuffer();
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1350);
  assert.equal(metadata.format, "jpeg");
  assert.throws(() => svgCard({ title: "x ".repeat(200), body: "" }, 0, 2));
});
test("publication cannot bypass human approval", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  await assert.rejects(() => wordpress(w, p.id), /Aprove/);
  assert.throws(() => httpsBase("http://example.com"));
  assert.throws(() => httpsBase("https://user:secret@example.com"));
});
test("uncertain WordPress response blocks duplicate requests", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  w.state.settings.demo = false;
  current(p).demo = false;
  w.state.settings.wordpressUrl = "https://example.com";
  w.state.settings.wordpressUser = "fixture";
  w.secrets = { wordpress: "fixture" };
  w.approve(p.id, "wordpress");
  let calls = 0;
  const original = global.fetch;
  global.fetch = async () => {
    calls++;
    throw Error("timeout");
  };
  try {
    await assert.rejects(() => wordpress(w, p.id), /incerto/);
    await assert.rejects(() => wordpress(w, p.id), /incerto/);
    assert.equal(calls, 1);
    assert.equal(p.publications.wordpress.status, "uncertain");
  } finally {
    global.fetch = original;
  }
});
test("confirmed WordPress publish is idempotent for same revision and updates by ID", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  w.state.settings.demo = false;
  current(p).demo = false;
  w.state.settings.wordpressUrl = "https://example.com";
  w.state.settings.wordpressUser = "fixture";
  w.secrets = { wordpress: "fixture" };
  w.approve(p.id, "wordpress");
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({ id: 123, link: "https://example.com/post" }),
    };
  };
  try {
    await wordpress(w, p.id);
    await wordpress(w, p.id);
    assert.equal(calls.length, 1);
    w.revise(p.id, { ...current(p), article: "Nova revisão" });
    w.approve(p.id, "wordpress");
    await wordpress(w, p.id);
    assert.equal(calls[1], "https://example.com/wp-json/wp/v2/posts/123");
  } finally {
    global.fetch = original;
  }
});
