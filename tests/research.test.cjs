const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const providers = require("../core/providers.cjs");
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-test-"));
  const w = await Workspace.open(root);
  w.state.settings.demo = false;
  w.state.settings.models = {
    researcher: "research-model",
    writer: "writer-model",
    social: "social-model",
    reviewer: "review-model",
  };
  w.secrets = { openrouter: "fixture-key" };
  const original = { ...providers };
  t.after(() => {
    Object.assign(providers, original);
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = w.create("Otite em cães", "Explicar prevenção aos tutores");
  p.messages.push({ role: "user", content: "Inclua também gatos", at: "now" });
  return { w, p };
}
const source = {
  pmid: "123",
  title: "Fixture",
  access: "abstract",
  abstract: "Fixture evidence",
};
function completion(content, model = "research-model") {
  return { content, model, usage: { total_tokens: 12 } };
}
test("researcher plans from user demand before fetching and preserves generated query on disk", async (t) => {
  const { w, p } = await fixture(t);
  p.query = "obsolete manual query";
  w.update(p.id, {
    title: p.title,
    brief: "Prevenção e cuidados para tutores",
  });
  const calls = [];
  providers.complete = async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      assert.equal(input.model, "research-model");
      const context = JSON.parse(input.messages[0].content);
      assert.equal(context.brief, p.brief);
      assert.equal(context.conversation[0].content, "Inclua também gatos");
      assert.equal(context.query, undefined);
      return completion('{"query":"otitis AND (dogs OR cats)"}');
    }
    assert.ok(p.sources.length);
    return completion(
      input.model === "social-model"
        ? JSON.stringify({
            caption: "Fixture",
            cards: [
              { title: "A", body: "B" },
              { title: "C", body: "D" },
            ],
          })
        : "Fixture evidence [PMID: 123]",
      input.model,
    );
  };
  providers.pubmed = async (query) => {
    assert.equal(calls.length, 1);
    assert.equal(query, "otitis AND (dogs OR cats)");
    return [source];
  };
  await run(w, p.id);
  assert.equal(p.status, "review");
  assert.equal(p.runs.length, 5);
  assert.equal(p.runs[0].phase, "search");
  assert.equal(p.runs[0].usage.total_tokens, 12);
  assert.equal(p.runs[0].resultCount, 1);
  const folder = w.dir;
  const query = p.query;
  assert.equal(p.revisions[0].sources[0].pmid, "123");
  w.close();
  const reopened = await Workspace.open(folder);
  try {
    assert.equal(reopened.project(p.id).query, query);
    assert.equal(reopened.project(p.id).runs[0].query, query);
  } finally {
    reopened.close();
  }
});
test("empty results trigger one autonomous reformulation and never write unsupported content", async (t) => {
  const { w, p } = await fixture(t);
  let plans = 0;
  providers.complete = async (input) => {
    plans++;
    assert.equal(input.model, "research-model");
    const context = JSON.parse(input.messages[0].content);
    if (plans === 2)
      assert.equal(context.previousQuery, "otitis canine prevention");
    return completion(
      JSON.stringify({
        query: plans === 1 ? "otitis canine prevention" : "otitis dogs",
      }),
    );
  };
  const queries = [];
  providers.pubmed = async (query) => {
    queries.push(query);
    return [];
  };
  await assert.rejects(run(w, p.id), /duas buscas/);
  assert.deepEqual(queries, ["otitis canine prevention", "otitis dogs"]);
  assert.equal(plans, 2);
  assert.equal(p.status, "failed");
  assert.equal(p.revisions.length, 0);
  assert.equal(p.runs[1].resultCount, 0);
});
test("invalid search plan fails before PubMed and clears stale sources", async (t) => {
  const { w, p } = await fixture(t);
  p.sources = [source];
  p.query = "old";
  providers.complete = async () => completion('{"query":"  "}');
  providers.pubmed = async () => assert.fail("must not search");
  await assert.rejects(run(w, p.id), /busca válida/);
  assert.equal(p.status, "failed");
  assert.equal(p.runs[0].status, "failed");
  assert.deepEqual(p.sources, []);
  assert.equal(p.query, "");
});
test("cancellation during planning prevents external search", async (t) => {
  const { w, p } = await fixture(t);
  const controller = new AbortController();
  providers.complete = async () => {
    controller.abort();
    return completion('{"query":"otitis"}');
  };
  providers.pubmed = async () => assert.fail("must not search");
  await assert.rejects(run(w, p.id, { signal: controller.signal }));
  assert.equal(p.status, "cancelled");
  assert.equal(p.runs[0].status, "cancelled");
});
test("PubMed service failure is not mistaken for an empty search", async (t) => {
  const { w, p } = await fixture(t);
  let calls = 0;
  providers.complete = async () => {
    calls++;
    return completion('{"query":"otitis"}');
  };
  providers.pubmed = async () => {
    throw Error("Service unavailable");
  };
  await assert.rejects(run(w, p.id), /Service unavailable/);
  assert.equal(calls, 1);
  assert.equal(p.status, "failed");
});
