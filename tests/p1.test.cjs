const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { Workspace, current } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const providers = require("../core/providers.cjs");
const { defaultStyle } = require("../core/editorial-model.cjs");
const context = require("../core/context.cjs");
const source = {
  id: "source-1",
  title: "Fonte original",
  abstract: "Evidência fornecida.",
  access: "abstract",
  url: "https://example.test/evidence",
};
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p1-"));
  const w = await Workspace.open(path.join(dir, "workspace"));
  const p = w.create("Pauta P1", "Briefing original", "", {
    channels: ["blog", "instagram"],
    manual: true,
  });
  w.revise(p.id, {
    article: "# Artigo original\n\nTexto do autor.",
    caption: "Legenda original",
    cards: [
      { title: "A", body: "Um" },
      { title: "B", body: "Dois" },
    ],
    sources: [source],
  });
  t.after(() => {
    try {
      w.close();
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { w, p, dir };
}
test("P1 drafts are lightweight, durable and do not create revisions or invalidate approvals", async (t) => {
  const { w, p } = await fixture(t);
  await w.approve(p.id, "wordpress");
  const before = fs.readFileSync(path.join(w.dir, "workspace.sqlite"));
  const revision = current(p),
    approval = structuredClone(p.approval),
    count = p.revisions.length;
  for (let i = 0; i < 8; i++)
    w.saveDraft({
      id: p.id,
      baseRevisionId: revision.id,
      content: { ...revision, article: "Rascunho " + i },
    });
  assert.equal(p.revisions.length, count);
  assert.deepEqual(p.approval, approval);
  assert.ok(
    fs.readFileSync(path.join(w.dir, "workspace.sqlite")).equals(before),
  );
  assert.equal(w.snapshot().projects[0].draft.content.article, "Rascunho 7");
  const dir = w.dir;
  w.close();
  const reopened = await Workspace.open(dir);
  try {
    assert.equal(
      reopened.snapshot().projects[0].draft.content.article,
      "Rascunho 7",
    );
  } finally {
    reopened.close();
  }
});
test("P1 portable backup retains the draft separately from immutable revisions", async (t) => {
  const { w, p, dir } = await fixture(t);
  w.saveDraft({
    id: p.id,
    baseRevisionId: current(p).id,
    content: { ...current(p), article: "Portável" },
  });
  w.backup(path.join(dir, "copy"));
  const copy = await Workspace.open(path.join(dir, "copy"));
  try {
    assert.equal(copy.snapshot().projects[0].draft.content.article, "Portável");
    assert.equal(current(copy.project(p.id)).article, current(p).article);
  } finally {
    copy.close();
  }
});
test("P1 stale draft writes are rejected and checkpoint clears only the matching project", async (t) => {
  const { w, p } = await fixture(t),
    old = current(p);
  w.saveDraft({
    id: p.id,
    baseRevisionId: old.id,
    content: { ...old, article: "Novo" },
  });
  w.revise(p.id, { ...old, article: "Novo" });
  assert.equal(w.snapshot().projects[0].draft, null);
  assert.throws(
    () => w.saveDraft({ id: p.id, baseRevisionId: old.id, content: old }),
    /revisão mudou/,
  );
});
test("P1 autosave coalesces keystrokes and flush waits for edits arriving during a write", async () => {
  const { createDraftWriter } = await import("../core/draft-writer.mjs");
  const calls = [];
  let release;
  const writer = createDraftWriter(async (payload) => {
    calls.push(payload);
    if (calls.length === 1) await new Promise((r) => (release = r));
  }, 10000);
  writer.schedule({ id: "one", content: "a" });
  writer.schedule({ id: "one", content: "ab" });
  const draining = writer.flush();
  await new Promise((r) => setImmediate(r));
  writer.schedule({ id: "one", content: "abc" });
  release();
  await draining;
  assert.deepEqual(
    calls.map((c) => c.content),
    ["ab", "abc"],
  );
  assert.equal(writer.getSnapshot().pending, false);
  writer.dispose();
});
test("P1 failed autosave stays recoverable and retry writes the latest draft", async () => {
  const { createDraftWriter } = await import("../core/draft-writer.mjs");
  let fail = true;
  const calls = [];
  const writer = createDraftWriter(async (payload) => {
    if (fail) throw Error("disk unavailable");
    calls.push(payload);
  }, 10000);
  writer.schedule({ id: "one", content: "first" });
  await assert.rejects(writer.flush(), /disk/);
  assert.equal(writer.getSnapshot().pending, true);
  writer.schedule({ id: "one", content: "latest" });
  fail = false;
  await writer.flush();
  assert.equal(calls[0].content, "latest");
  assert.equal(writer.getSnapshot().error, "");
  writer.dispose();
});
test("P1 renderer cache deduplicates concurrent requests and enforces LRU byte limits", async () => {
  const { createRenderCache } = require("../core/render-cache.cjs");
  const cache = createRenderCache({ maxBytes: 6, maxEntries: 2 });
  let calls = 0;
  const render = async () => {
    calls++;
    await new Promise((r) => setImmediate(r));
    return Buffer.from("abc");
  };
  await Promise.all([cache.get("one", render), cache.get("one", render)]);
  assert.equal(calls, 1);
  await cache.get("two", render);
  await cache.get("three", render);
  assert.equal(cache.size, 2);
  assert.equal(cache.bytes, 6);
  await cache.get("one", render);
  assert.equal(calls, 4);
});
test("P1 renderer cache retries failed renders instead of storing a broken promise", async () => {
  const { createRenderCache } = require("../core/render-cache.cjs");
  const cache = createRenderCache();
  let count = 0;
  const render = async () => {
    if (++count === 1) throw Error("failed");
    return Buffer.from("ok");
  };
  await assert.rejects(cache.get("card", render));
  assert.equal((await cache.get("card", render)).toString(), "ok");
});
test("P1 changing one card renders only that card; reordering and style changes invalidate correctly", async (t) => {
  const { w, p } = await fixture(t);
  const sharpPath = require.resolve("sharp"),
    original = require("sharp");
  let calls = 0;
  require.cache[sharpPath].exports = (...args) => {
    calls++;
    return original(...args);
  };
  t.after(() => (require.cache[sharpPath].exports = original));
  const render = require("../core/render.cjs"),
    cards = current(p).cards;
  await render.renderJPEGs(w.dir, cards, defaultStyle);
  assert.equal(calls, 2);
  await render.renderJPEGs(w.dir, cards, defaultStyle);
  assert.equal(calls, 2);
  const next = [{ ...cards[0], body: "Alterado" }, cards[1]];
  await render.renderJPEGs(w.dir, next, defaultStyle);
  assert.equal(calls, 3);
  await render.renderJPEGs(w.dir, [...next].reverse(), defaultStyle);
  assert.equal(calls, 5);
  await render.renderJPEGs(w.dir, next, { ...defaultStyle, fontScale: 1.15 });
  assert.equal(calls, 7);
});
test("P1 invalid preview is isolated to its card, strict export still rejects invalid content", async (t) => {
  const { w } = await fixture(t);
  const { previewCards, renderJPEGs } = require("../core/render.cjs");
  const cards = [
    { title: "Too long".repeat(20), body: "x" },
    { title: "Válido", body: "Permanece visível" },
  ];
  const result = await previewCards(w.dir, cards, defaultStyle);
  assert.match(result[0].error, /90/);
  assert.match(result[1].image, /^data:image\/jpeg/);
  await assert.rejects(renderJPEGs(w.dir, cards, defaultStyle));
});
test("P1 source assets are validated even when a card is already cached", async (t) => {
  const { w, dir } = await fixture(t),
    assets = require("../core/assets.cjs"),
    render = require("../core/render.cjs");
  const file = path.join(dir, "original.png");
  await require("sharp")({
    create: { width: 80, height: 60, channels: 3, background: "#112233" },
  })
    .png()
    .toFile(file);
  const image = await assets.importImage(w.dir, file),
    cards = [{ title: "Imagem", body: "Texto", image }];
  await render.renderJPEGs(w.dir, cards, { ...defaultStyle, layout: "split" });
  fs.writeFileSync(path.join(w.dir, image.path), "corrupted");
  await assert.rejects(
    render.renderJPEGs(w.dir, cards, { ...defaultStyle, layout: "split" }),
  );
});
test("P1 author profile is bounded and research does not receive style examples", () => {
  const state = {
    knowledge: {
      general: "g".repeat(100000),
      blog: "b".repeat(30000),
      instagram: "i".repeat(30000),
      examples: "EXAMPLE".repeat(5000),
    },
  };
  assert.ok(context.estimateTokens(context.profile(state, "writer")) < 2600);
  assert.ok(!context.profile(state, "researcher").includes("EXAMPLE"));
});
test("P1 persistent decisions survive conversation window changes and do not mutate history", async (t) => {
  const { w, p } = await fixture(t);
  w.update(p.id, {
    title: p.title,
    brief: p.brief,
    decisions: { audience: "Pacientes", thesis: "Decisão antiga e importante" },
  });
  p.messages = Array.from({ length: 80 }, (_, i) => ({
    role: "user",
    content: "mensagem " + i + " ".repeat(200),
    at: "now",
  }));
  const before = JSON.stringify(p.messages);
  const result = require("../core/editorial-model.cjs").scopedContext(
    p,
    "writer",
    {},
    current(p),
  );
  assert.equal(result.decisions.thesis, "Decisão antiga e importante");
  assert.equal(JSON.stringify(p.messages), before);
  assert.ok(context.estimateTokens(result.conversation) < 2100);
  w.save();
  assert.equal(w.snapshot().projects[0].decisions.audience, "Pacientes");
});
test("P1 context rejects oversized primary material instead of silently truncating it", () => {
  const primary = "Important facts ".repeat(10000);
  const packed = context.prepareContext({
    article: primary,
    previousAttempt: "x".repeat(50000),
  });
  assert.equal(JSON.parse(packed).article, primary);
  assert.ok(JSON.parse(packed).previousAttempt.length < 10000);
  assert.throws(
    () => context.budget("system", [{ role: "user", content: packed }], 6000),
    /orçamento/,
  );
});
test("P1 adaptation invokes only social and reviewer without researcher or writer", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models = {
    researcher: "",
    writer: "",
    social: "social-model",
    reviewer: "review-model",
  };
  const article = current(p).article,
    calls = [],
    real = providers.complete;
  providers.complete = async (options) => {
    calls.push(options);
    return {
      model: options.model,
      usage: { total_tokens: 12 },
      content:
        options.model === "social-model"
          ? JSON.stringify({
              caption: "Nova legenda",
              cards: [
                { title: "Um", body: "Texto" },
                { title: "Dois", body: "Outro" },
              ],
            })
          : "Revisão",
    };
  };
  t.after(() => (providers.complete = real));
  await run(w, p.id, { mode: "adapt", targets: ["instagram"] });
  assert.deepEqual(
    calls.map((c) => c.model),
    ["social-model", "review-model"],
  );
  assert.equal(current(p).article, article);
  assert.deepEqual(current(p).sources, [source]);
  assert.equal(p.sessions.at(-1).mode, "adapt");
  assert.equal(
    p.runs.some((r) => r.role === "researcher"),
    false,
  );
});
test("P1 adapting both channels requires only writer, social and reviewer", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models = {
    writer: "writer",
    social: "social",
    reviewer: "reviewer",
  };
  const real = providers.complete,
    calls = [];
  providers.complete = async (opts) => {
    calls.push(opts.model);
    return {
      model: opts.model,
      usage: {},
      content:
        opts.model === "social"
          ? JSON.stringify({
              caption: "Legenda",
              cards: [
                { title: "Um", body: "x" },
                { title: "Dois", body: "y" },
              ],
            })
          : opts.model === "writer"
            ? "# Artigo adaptado"
            : "Revisão",
    };
  };
  t.after(() => (providers.complete = real));
  await run(w, p.id, { mode: "adapt", targets: ["blog", "instagram"] });
  assert.deepEqual(calls, ["writer", "social", "reviewer"]);
});
test("P1 adaptation without existing article fails before changing the project", async (t) => {
  const { w, p } = await fixture(t);
  w.revise(p.id, { ...current(p), article: "" });
  const before = JSON.stringify(p);
  await assert.rejects(run(w, p.id, { mode: "adapt" }), /artigo/);
  assert.equal(JSON.stringify(p), before);
});
test("P1 partial generation saves text and consumption without promoting an incomplete revision", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models = { writer: "writer", reviewer: "reviewer" };
  const real = providers.complete,
    before = current(p).id;
  let limited = true,
    calls = [];
  providers.complete = async (opts) => {
    calls.push(opts);
    return {
      model: opts.model,
      usage: { total_tokens: 90 },
      finishReason: limited ? "length" : "stop",
      content: limited
        ? "# Texto parcial"
        : opts.model === "writer"
          ? "# Completo"
          : "Revisão",
    };
  };
  t.after(() => (providers.complete = real));
  await assert.rejects(
    run(w, p.id, { mode: "adapt", targets: ["blog"] }),
    /parcial/,
  );
  assert.equal(current(p).id, before);
  assert.equal(p.sessions.at(-1).artifacts.partial.content, "# Texto parcial");
  assert.equal(p.runs.at(-1).usage.total_tokens, 180);
  assert.deepEqual(
    calls.slice(0, 2).map((call) => call.maxTokens),
    [6000, 9000],
  );
  limited = false;
  await run(w, p.id, { resume: true });
  assert.equal(calls[2].maxTokens, 9000);
  assert.equal(current(p).article, "# Completo");
});
test("P1 rewrite receives durable decisions and recent directions without external search", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models.social = "social";
  p.decisions = { ...context.decisions(p), thesis: "Manter a tese" };
  p.messages.push({ role: "user", content: "Use linguagem direta", at: "now" });
  const real = providers.complete;
  let sent;
  providers.complete = async (options) => {
    sent = options;
    return { model: "social", usage: {}, content: "Legenda revisada" };
  };
  t.after(() => (providers.complete = real));
  await require("../core/rewrite.cjs").rewrite(w, {
    id: p.id,
    baseRevisionId: current(p).id,
    target: "caption",
    text: "Legenda original",
    instruction: "Encurte",
  });
  const input = JSON.parse(sent.messages[0].content);
  assert.equal(input.decisions.thesis, "Manter a tese");
  assert.equal(input.conversation[0].content, "Use linguagem direta");
  assert.equal(input.text, "Legenda original");
  assert.equal(sent.webSearch, undefined);
});
test("P1 unreadable draft is isolated and never overwritten by autosave", async (t) => {
  const { w, p } = await fixture(t);
  w.saveDraft({ id: p.id, baseRevisionId: current(p).id, content: current(p) });
  const file = path.join(w.dir, "drafts", p.id + ".json");
  fs.writeFileSync(file, "unreadable");
  assert.match(w.snapshot().projects[0].draftError, /preservado/);
  assert.throws(
    () =>
      w.saveDraft({
        id: p.id,
        baseRevisionId: current(p).id,
        content: current(p),
      }),
    /preservado/,
  );
  assert.equal(fs.readFileSync(file, "utf8"), "unreadable");
  const other = w.create("Outra pauta", "", "", {
    manual: true,
    channels: ["blog"],
  });
  assert.equal(w.snapshot().projects[0].draft, null);
});
test("P1 explicitly partial-aware callers retain empty length response usage", async (t) => {
  const old = global.fetch;
  t.after(() => (global.fetch = old));
  global.fetch = async () =>
    Response.json({
      model: "fixture",
      choices: [{ finish_reason: "length", message: { content: null } }],
      usage: { total_tokens: 5000 },
    });
  const result = await providers.complete({
    key: "fixture",
    model: "fixture",
    system: "Test",
    messages: [],
    allowPartial: true,
  });
  assert.equal(result.content, "");
  assert.equal(result.finishReason, "length");
  assert.equal(result.usage.total_tokens, 5000);
});
test("P1 search planning stores truncated output and does not run an external search", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models = Object.fromEntries(
    ["researcher", "writer", "social", "reviewer"].map((r) => [r, "fixture"]),
  );
  const old = providers.complete,
    oldSearch = providers.pubmed;
  t.after(() => {
    providers.complete = old;
    providers.pubmed = oldSearch;
  });
  providers.complete = async () => ({
    model: "fixture",
    content: '{"query":',
    finishReason: "length",
    usage: { total_tokens: 800 },
  });
  providers.pubmed = async () => {
    throw Error("Unexpected external search");
  };
  await assert.rejects(run(w, p.id), /plano de pesquisa atingiu/);
  assert.equal(p.sessions.at(-1).artifacts.partial.phase, "search");
  assert.equal(p.runs.at(-1).usage.total_tokens, 1600);
  assert.equal(p.sessions.at(-1).cursor, "search");
});
