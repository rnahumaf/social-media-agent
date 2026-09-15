const test = require("node:test");
const assert = require("node:assert/strict");
const renderer = require("../core/render.cjs");
const { approvedImages } = require("../core/publish.cjs");

test("P0 changed rendering makes approval actionable again without changing content", async (t) => {
  const original = renderer.renderJPEGs;
  t.after(() => { renderer.renderJPEGs = original; });
  renderer.renderJPEGs = async () => [Buffer.from("changed fixture bytes")];
  let saved = 0;
  const revision = { id: "r1", caption: "Caption", cards: [{ title: "A", body: "B" }] };
  const p = {
    channels: ["instagram"], revisions: [revision], publications: {},
    approvalMedia: ["old-hash"],
    approval: { instagram: "old", export: "old", wordpress: "keep-blog" },
  };
  await assert.rejects(approvedImages({ save: () => saved++ }, p, revision), /renderização mudou/);
  assert.equal(saved, 1);
  assert.equal(p.approval.instagram, undefined);
  assert.equal(p.approval.export, undefined);
  assert.equal(p.approval.wordpress, "keep-blog");
  assert.equal(p.revisions[0], revision);
  const { publicationView } = await import("../core/publication-view.mjs");
  p.revisions[0].cards.push({ title: "C", body: "D" });
  const view = publicationView(p, { settings: {} }, "export");
  assert.equal(view.canApprove, true);
  assert.equal(view.canPublish, false);
});
