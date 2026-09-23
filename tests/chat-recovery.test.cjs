const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace } = require("../core/workspace.cjs");

test("reopening a workspace makes an unfinished chat message retryable", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-recovery-"));
  try {
    const first = await Workspace.open(dir);
    const p = first.create("Pauta fictícia", "", "", {
      channels: ["blog"],
    });
    p.messages.push({
      role: "user",
      content: "Mensagem de teste",
      requestId: "request-1",
      status: "sending",
      at: new Date().toISOString(),
    });
    first.save();
    first.close();

    const reopened = await Workspace.open(dir);
    try {
      const message = reopened.project(p.id).messages[0];
      assert.equal(message.status, "interrupted");
      assert.equal(message.requestId, "request-1");
      assert.match(message.error, /pode ser retomada/);
    } finally {
      reopened.close();
    }
  } finally {
    const resolved = fs.realpathSync(dir);
    if (
      path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(resolved).startsWith("chat-recovery-")
    )
      throw Error("Unexpected chat fixture path.");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
