const test = require("node:test");
const assert = require("node:assert/strict");
const { OperationManager } = require("../core/operations.cjs");
const { reviewFeedback, reviewFingerprint } = require("../core/provenance.cjs");
const { failureStatus } = require("../core/publication-errors.cjs");
const fixture = () => {
  const revision = { id: "r1", article: "Artigo", caption: "Legenda", cards: [{ title: "A", body: "B" }, { title: "C", body: "D" }], sources: [] };
  const project = { title: "Tema", brief: "Público geral", channels: ["blog", "instagram"], revisions: [revision], messages: [], publications: {}, approval: {} };
  const state = { unlocked: true, instagramMediaConfigured: true, settings: { wordpressUrl: "https://example.test", wordpressUser: "writer", bloggerId: "123", instagramAccount: "456" } };
  return { revision, project, state };
};
test("P0 cancellation is scoped to the operation and cannot cancel a successor", () => {
  const manager = new OperationManager();
  const first = manager.begin("chat", "p1", true);
  const firstSignal = manager.signal;
  assert.equal(manager.snapshot().projectId, "p1");
  assert.equal("controller" in manager.snapshot(), false);
  assert.throws(() => manager.begin("run", "p2", true), /Aguarde/);
  manager.cancel(first);
  assert.equal(firstSignal.aborted, true);
  assert.equal(manager.snapshot().cancelRequested, true);
  manager.finish(first);
  const second = manager.begin("rewrite", "p2", true);
  assert.throws(() => manager.cancel(first), /já terminou/);
  manager.finish(first);
  assert.equal(manager.snapshot().id, second);
  assert.equal(manager.signal.aborted, false);
  manager.cancel(second);
  manager.finish(second);
  assert.equal(manager.snapshot(), null);
});
test("P0 noncancellable operations never expose a controller", () => {
  const manager = new OperationManager();
  const id = manager.begin("publish", "p1");
  assert.equal(manager.snapshot().cancellable, false);
  assert.equal(manager.signal, undefined);
  assert.throws(() => manager.cancel(id), /não pode/);
  manager.finish(id);
});
test("P0 published Instagram cannot be submitted again, including a newer revision", async () => {
  const { publicationView } = await import("../core/publication-view.mjs");
  const { project, state } = fixture();
  project.publications.instagram = { status: "published", revision: "r1", destination: "456" };
  let view = publicationView(project, state, "instagram", { desktop: true });
  assert.equal(view.mode, "published"); assert.equal(view.canPublish, false); assert.equal(view.canApprove, false);
  project.revisions.push({ ...project.revisions[0], id: "r2" });
  view = publicationView(project, state, "instagram", { desktop: true });
  assert.match(view.status, /anterior/); assert.equal(view.canPublish, false);
});
test("P0 blog publication distinguishes published, update, failed and unknown revisions", async () => {
  const { publicationView } = await import("../core/publication-view.mjs");
  for (const channel of ["wordpress", "blogger"]) {
    const { project, state } = fixture();
    project.publications[channel] = { status: "published", revision: "r1", remoteId: "9", title: "Tema" };
    assert.equal(publicationView(project, state, channel).mode, "published");
    project.revisions.push({ ...project.revisions[0], id: "r2" });
    let view = publicationView(project, state, channel);
    assert.equal(view.mode, "update"); assert.match(view.status, /não publicadas/);
    project.publications[channel].status = "uncertain";
    view = publicationView(project, state, channel, { dirty: true, desktop: true });
    assert.equal(view.mode, "recover"); assert.equal(view.canCheck, true); assert.equal(view.canPublish, false);
    project.publications[channel].status = "reconciled";
    delete project.publications[channel].revision;
    assert.equal(publicationView(project, state, channel).mode, "update");
  }
});
test("P0 publication respects title changes, connection, destination, dirty and invalid cards", async () => {
  const { publicationView } = await import("../core/publication-view.mjs");
  const { project, state } = fixture();
  project.publications.wordpress = { status: "published", revision: "r1", remoteId: "9", title: "Título anterior" };
  assert.equal(publicationView(project, state, "wordpress").mode, "update");
  project.publications.wordpress.destination = "https://other.test";
  assert.equal(publicationView(project, state, "wordpress").mode, "connect");
  project.revisions[0].cards = [{ title: "A", body: "B" }];
  project.approval.instagram = "saved";
  assert.equal(publicationView(project, state, "instagram").canPublish, false);
  state.unlocked = false;
  assert.equal(publicationView(project, state, "instagram", { desktop: true }).mode, "connect");
});
test("P0 review belongs to exact content, title, briefing and channels", () => {
  const { project, revision } = fixture();
  project.messages.push({ role: "assistant", agent: "reviewer", content: "Revisão A", revisionId: revision.id, reviewedChannels: ["blog"], reviewFingerprint: reviewFingerprint(project, revision, ["blog"]) });
  assert.equal(reviewFeedback(project).status, "current");
  project.title = "Outro tema"; assert.equal(reviewFeedback(project).status, "stale");
  project.title = "Tema"; project.brief = "Outra demanda"; assert.equal(reviewFeedback(project).status, "stale");
  project.brief = "Público geral"; project.revisions.push({ ...revision, id: "r2" }); assert.equal(reviewFeedback(project).status, "stale");
  assert.equal(reviewFeedback(project, revision).status, "current");
});
test("P0 legacy feedback is visible as unbound, never as a current review", () => {
  const { project } = fixture();
  project.messages.push({ role: "assistant", agent: "reviewer", content: "Sem revisão associada" });
  assert.equal(reviewFeedback(project).status, "legacy");
});
test("P0 only definite rejections or pre-submission failures become retryable", () => {
  assert.equal(failureStatus(Error("timeout")), "uncertain");
  assert.equal(failureStatus({ httpStatus: 500 }), "uncertain");
  assert.equal(failureStatus({ httpStatus: 408 }), "uncertain");
  assert.equal(failureStatus({ httpStatus: 403 }), "failed");
  assert.equal(failureStatus(Error("container creation failed"), false), "failed");
});
