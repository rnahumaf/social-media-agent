const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Workspace, current } = require("../core/workspace.cjs");
const providers = require("../core/providers.cjs");
const blogger = require("../core/blogger.cjs");
const { reconcile } = require("../core/reconcile.cjs");
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p0-flow-"));
  const w = await Workspace.open(dir);
  t.after(() => { w.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const p = w.create("Tema", "Público geral", "", { channels: ["blog", "instagram"], manual: true });
  w.unlock("fixture-password-long", { openrouter: "fixture", wordpress: "fixture", instagram: "fixture" });
  Object.assign(w.state.settings, { wordpressUrl: "https://example.test", wordpressUser: "author", bloggerId: "123", bloggerUrl: "https://example.blogspot.com", instagramAccount: "456" });
  const sources = [{ title: "Fonte original", pmid: "1", id: "1", abstract: "Texto original", access: "abstract", url: "https://example.test/source" }];
  w.revise(p.id, { article: "# Tema\n\nTexto original.", caption: "Legenda", cards: [{ title: "A", body: "B" }, { title: "C", body: "D" }], sources });
  return { w, p };
}
function mockRequest(t, fn) {
  const original = providers.request;
  providers.request = fn;
  t.after(() => { providers.request = original; });
}
test("P0 WordPress reconciliation binds the attempted revision, not a newer edit", async t => {
  const { w, p } = await fixture(t), previousRevision = current(p);
  const { renderBlog } = await import("../core/blog-html.mjs");
  p.publications.wordpress = { status: "uncertain", revision: previousRevision.id, title: p.title, destination: w.state.settings.wordpressUrl };
  w.revise(p.id, { ...previousRevision, article: "# Tema\n\nEdição posterior." });
  let calls = 0;
  mockRequest(t, async (url, options) => {
    calls++; assert.equal(options.method, undefined); assert.match(url, /\/posts\/77\?context=edit$/);
    return { id: 77, status: "publish", title: { raw: p.title }, content: { raw: renderBlog(previousRevision.article) }, link: "https://example.test/post" };
  });
  await reconcile(w, { id: p.id, remoteId: "77" });
  assert.equal(calls, 1);
  assert.equal(p.publications.wordpress.revision, previousRevision.id);
  assert.notEqual(p.publications.wordpress.revision, current(p).id);
  const { publicationView } = await import("../core/publication-view.mjs");
  assert.equal(publicationView(p, w.snapshot(), "wordpress").mode, "update");
});
test("P0 differing remote content is linked without claiming it is the local revision", async t => {
  const { w, p } = await fixture(t);
  p.publications.wordpress = { status: "uncertain", revision: current(p).id, title: p.title, remoteId: "77" };
  mockRequest(t, async () => ({ id: 77, status: "publish", title: "Outro título", content: "Outro conteúdo" }));
  await reconcile(w, { id: p.id, channel: "wordpress" });
  assert.equal(p.publications.wordpress.status, "reconciled");
  assert.equal(p.publications.wordpress.revision, undefined);
  assert.equal(p.publications.wordpress.remoteId, "77");
});
test("P0 Blogger rejects a post from a different blog", async t => {
  const { w, p } = await fixture(t);
  const verify = blogger.verify;
  blogger.verify = async () => ({ token: "fixture" });
  t.after(() => { blogger.verify = verify; });
  p.publications.blogger = { status: "uncertain", revision: current(p).id, destination: "123" };
  mockRequest(t, async () => ({ id: "77", blog: { id: "other" }, status: "LIVE" }));
  await assert.rejects(reconcile(w, { id: p.id, channel: "blogger", remoteId: "77" }), /não confirmou/);
  assert.equal(p.publications.blogger.status, "uncertain");
});
test("P0 Instagram checks never republish: FINISHED is not PUBLISHED", async t => {
  const { w, p } = await fixture(t);
  p.publications.instagram = { status: "uncertain", revision: current(p).id, containerId: "789", destination: "456" };
  let calls = 0;
  mockRequest(t, async (url, options) => {
    calls++; assert.equal(options.method, undefined); assert.match(url, /789\?fields=status_code$/);
    return { status_code: calls === 1 ? "FINISHED" : "PUBLISHED" };
  });
  await reconcile(w, { id: p.id, channel: "instagram" });
  assert.equal(p.publications.instagram.status, "uncertain");
  await reconcile(w, { id: p.id, channel: "instagram" });
  assert.equal(p.publications.instagram.status, "published");
  assert.equal(calls, 2);
});
test("P0 Instagram interrupted before submission becomes explicitly retryable", async t => {
  const { w, p } = await fixture(t);
  p.publications.instagram = { status: "uncertain", attemptVersion: 2, revision: current(p).id, containerId: "789", destination: "456" };
  mockRequest(t, async () => { throw Error("No remote call needed before submission"); });
  await reconcile(w, { id: p.id, channel: "instagram" });
  assert.equal(p.publications.instagram.status, "failed");
});
test("P0 Instagram manual binding checks account ownership and does not claim equal images", async t => {
  const { w, p } = await fixture(t);
  p.publications.instagram = { status: "uncertain", revision: current(p).id, containerId: "789", destination: "456" };
  mockRequest(t, async (url, options) => {
    assert.equal(options.method, undefined);
    if (url.includes("/media?")) return { data: [{ id: "88" }] };
    return { id: "88", permalink: "https://www.instagram.com/p/fixture/" };
  });
  await assert.rejects(reconcile(w, { id: p.id, channel: "instagram", remoteId: "99" }), /não foi encontrado/);
  await reconcile(w, { id: p.id, channel: "instagram", remoteId: "88" });
  assert.equal(p.publications.instagram.status, "reconciled");
  assert.equal(p.publications.instagram.revision, undefined);
  assert.equal(p.publications.instagram.remoteId, "88");
});
test("P0 failed regeneration preserves previous revision sources and review validity", async t => {
  const { w, p } = await fixture(t);
  p.channels = ["blog"];
  w.state.settings.models = { researcher: "fixture", writer: "fixture", reviewer: "fixture" };
  const saved = structuredClone(current(p));
  const complete = providers.complete, pubmed = providers.pubmed;
  t.after(() => { providers.complete = complete; providers.pubmed = pubmed; });
  let calls = 0;
  providers.complete = async () => {
    calls++;
    if (calls === 1) return { content: '{"provider":"pubmed","query":"new search"}', model: "fixture", usage: {} };
    throw Error("fixture failure after sources");
  };
  providers.pubmed = async () => [{ title: "Fonte nova", pmid: "2", abstract: "Nova pesquisa", access: "abstract", url: "https://example.test/new" }];
  const { run } = require("../core/pipeline.cjs");
  await assert.rejects(run(w, p.id, { targets: ["blog"] }), /fixture failure/);
  assert.equal(current(p).id, saved.id);
  assert.deepEqual(current(p).sources, saved.sources);
  assert.equal(p.sessions.at(-1).artifacts.sources[0].pmid, "2");
  assert.equal(p.sessions.at(-1).revisionId, undefined);
});
test("P0 generation persists exact review provenance and search snapshot", async t => {
  const { w, p } = await fixture(t);
  p.channels = ["blog"];
  w.state.settings.models = { researcher: "fixture", writer: "fixture", reviewer: "fixture" };
  const complete = providers.complete, pubmed = providers.pubmed;
  t.after(() => { providers.complete = complete; providers.pubmed = pubmed; });
  const outputs = ['{"provider":"pubmed","query":"evidence"}', "Dossiê", "# Artigo novo\n\nConteúdo.", "Revisão vinculada."];
  providers.complete = async () => ({ content: outputs.shift(), model: "fixture", usage: {} });
  providers.pubmed = async () => [{ title: "Fonte nova", pmid: "2", abstract: "Resumo", access: "abstract", url: "https://example.test/new" }];
  await require("../core/pipeline.cjs").run(w, p.id, { targets: ["blog"] });
  assert.equal(w.snapshot().projects[0].reviewFeedback.status, "current");
  assert.equal(current(p).research.searches[0].query, "evidence");
  const reviewed = current(p).id;
  w.revise(p.id, { ...current(p), article: "# Editado" });
  assert.equal(w.snapshot().projects[0].reviewFeedback.status, "stale");
  assert.equal(p.messages.find(m => m.agent === "reviewer" && m.role === "assistant").revisionId, reviewed);
});
