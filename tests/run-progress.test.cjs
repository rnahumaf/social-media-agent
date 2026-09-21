const test = require("node:test");
const assert = require("node:assert/strict");
const { runProgress } = require("../core/run-progress.mjs");
test("timeline follows the persisted stage and only includes channels in this execution", () => {
  const full = runProgress({
    status: "running",
    cursor: "social",
    channels: ["blog", "instagram"],
  });
  assert.deepEqual(
    full.steps.map((step) => step.id),
    ["search", "researcher", "writer", "social", "reviewer"],
  );
  assert.deepEqual(
    full.steps.map((step) => step.state),
    ["complete", "complete", "complete", "active", "pending"],
  );
  assert.equal(full.completed, 3);
  const social = runProgress(
    {
      status: "running",
      cursor: "social",
      mode: "adapt",
      channels: ["instagram"],
    },
    ["blog", "instagram"],
  );
  assert.deepEqual(
    social.steps.map((step) => step.id),
    ["social", "reviewer"],
  );
  assert.equal(social.completed, 0);
  assert.equal(social.currentIndex, 0);
  const blog = runProgress({ status: "running", cursor: "writer" }, ["blog"]);
  assert.deepEqual(
    blog.steps.map((step) => step.id),
    ["search", "researcher", "writer", "reviewer"],
  );
});
test("pause, cancellation and resumption retain completed stages without advancing progress", () => {
  for (const status of ["paused", "cancelled", "interrupted", "running"]) {
    const progress = runProgress({ status, cursor: "writer" });
    assert.equal(progress.completed, 2);
    assert.equal(
      progress.steps[2].state,
      status === "running" ? "active" : status,
    );
    assert.equal(progress.steps[3].state, "pending");
  }
  const done = runProgress({
    status: "completed",
    cursor: "done",
    channels: ["instagram"],
  });
  assert.equal(done.completed, 4);
  assert.equal(done.currentIndex, -1);
  assert.ok(done.steps.every((step) => step.state === "complete"));
  assert.ok(
    runProgress({ status: "running", cursor: "done" }).steps.every(
      (step) => step.state === "complete",
    ),
  );
  const unknown = runProgress({ status: "interrupted", cursor: "unknown" });
  assert.ok(unknown.steps.every((step) => step.state === "pending"));
});
