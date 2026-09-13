const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const { svgCard, cardLayout } = require("../core/render.cjs");
const { wordpress, httpsBase } = require("../core/publish.cjs");
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-test-"));
  const w = await Workspace.open(path.join(root, "source"), {testMode:true});
  t.after(() => {
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { w, root };
}
test("WordPress.com uses the selected site and disables automatic social sharing", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  Object.assign(w.state.settings, {
    demo: false,
    wordpressProvider: "wordpress.com",
    wordpressSiteId: "456",
    wordpressUrl: "https://fixture.wordpress.com",
  });
  current(p).demo = false;
  w.secrets = { wordpressCom: "fixture" };
  await w.approve(p.id, "wordpress");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, "Bearer fixture");
    assert.equal(JSON.parse(options.body).publicize, false);
    return Response.json({
      ID: 123,
      URL: "https://fixture.wordpress.com/post",
    });
  };
  const result = await wordpress(w, p.id);
  assert.equal(result.remoteId, 123);
  assert.equal(result.url, "https://fixture.wordpress.com/post");
  await wordpress(w, p.id);
  assert.equal(calls.length, 1);
  w.revise(p.id, { ...current(p), article: "Revisão" });
  await w.approve(p.id, "wordpress");
  await wordpress(w, p.id);
  assert.deepEqual(calls, [
    "https://public-api.wordpress.com/rest/v1.1/sites/456/posts/new",
    "https://public-api.wordpress.com/rest/v1.1/sites/456/posts/123",
  ]);
});
test("demo survives a workspace transfer with revisions, conversation and encrypted credentials", async (t) => {
  const { w, root } = await fixture(t);
  const p = w.create(
    "Comunicação científica",
    "Público geral",
    "science communication",
  );
  w.unlock("senha-ficticia-longa", { openrouter: "test-key-never-real" });
  await run(w, p.id);
  await w.approve(p.id, "export");
  w.backup(path.join(root, "copy"));
  assert.equal(p.revisions.length, 1);
  assert.equal(p.runs.filter((r) => r.status === "completed").length, 4);
  const copy = await Workspace.open(path.join(root, "copy"), {testMode:true});
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
test("workspace recovers text truncated by the old carousel fallback", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  const fullBody = "texto preservado ".repeat(40).trim();
  const truncatedBody = fullBody.slice(0, 419).trimEnd() + "…";
  const revision = w.revise(p.id, {
    article: "# Artigo",
    caption: "Legenda",
    cards: [
      { title: "Card longo", body: truncatedBody },
      { title: "Segundo", body: "Outro texto" },
    ],
  });
  p.approval = { export: "aprovação-antiga" };
  p.sessions.push({
    id: "sessão-antiga",
    status: "completed",
    cursor: "done",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events: [
      {
        id: "evento-antigo",
        at: new Date().toISOString(),
        kind: "tool_result",
        role: "social",
        title: "Limites aplicados pelo aplicativo",
        detail: "A estrutura era válida; textos longos foram encurtados.",
      },
    ],
    artifacts: {
      responses: [
        {
          id: "resposta-antiga",
          role: "social",
          content: JSON.stringify({
            caption: "Legenda",
            cards: [
              { title: "Card longo", body: fullBody },
              { title: "Segundo", body: "Outro texto" },
            ],
          }),
          at: new Date().toISOString(),
        },
      ],
    },
    revisionId: revision.id,
  });
  w.save();
  const directory = w.dir;
  w.close();

  const reopened = await Workspace.open(directory);
  try {
    const restoredProject = reopened.project(p.id);
    const restored = current(restoredProject);
    assert.equal(restoredProject.revisions.length, 2);
    assert.equal(restored.sourceRevision, revision.id);
    assert.equal(restoredProject.approval, null);
    assert.equal(
      restored.cards
        .slice(0, -1)
        .map((card) => card.body)
        .join(" "),
      fullBody,
    );
    assert.ok(restored.cards.every((card) => !card.body.endsWith("…")));
    assert.ok(
      restoredProject.sessions[0].events.some(
        (event) => event.title === "Texto integral do carrossel recuperado",
      ),
    );
  } finally {
    reopened.close();
  }
});
test("revision edits and destination changes invalidate approval", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  await w.approve(p.id, "wordpress");
  assertApproved(p, w.state.settings, "wordpress");
  w.state.settings.wordpressUrl = "https://changed.example";
  assert.throws(() => assertApproved(p, w.state.settings, "wordpress"));
  await w.approve(p.id, "export");
  w.revise(p.id, { ...current(p), article: "Alterado" });
  assert.equal(p.revisions.length, 2);
  assert.throws(() => assertApproved(p, w.state.settings, "export"));
});
test("exclusive workspace lock and non-empty backup protection", async (t) => {
  const { w, root } = await fixture(t);
  await assert.rejects(() => Workspace.open(w.dir, {testMode:true}), /em uso/);
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
  await w.approve(p.id, "export");
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
test("render adapts typography for a valid card near the content limit", async () => {
  const sharp = require("sharp");
  const card = {
    title: "Quando um resultado realmente merece investigação?",
    body: "Uma alteração precisa ser interpretada conforme a pergunta clínica, o contexto e as consequências de investigar. "
      .repeat(6)
      .slice(0, 420),
  };
  const layout = cardLayout(card);
  const bottom =
    layout.bodyY + (layout.body.length - 1) * layout.bodyLineHeight;
  assert.ok(layout.bodySize >= 30);
  assert.ok(bottom <= 1160);
  const bytes = await sharp(Buffer.from(svgCard(card, 0, 4)))
    .jpeg()
    .toBuffer();
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1350);
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
  await w.approve(p.id, "wordpress");
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
  await w.approve(p.id, "wordpress");
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
    await w.approve(p.id, "wordpress");
    await wordpress(w, p.id);
    assert.equal(calls[1], "https://example.com/wp-json/wp/v2/posts/123");
  } finally {
    global.fetch = original;
  }
});
