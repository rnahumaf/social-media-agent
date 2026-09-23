const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-limits-desktop-"));
const electron = require("electron");
const result = spawnSync(electron, [path.join(__dirname, "chat-limits-desktop.cjs")], {
  stdio: "inherit",
  env: { ...process.env, STUDIO_CHAT_TEST_ROOT: root },
  timeout: 120000,
});

try {
  const resolved = fs.realpathSync(root);
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("chat-limits-desktop-")
  )
    throw Error("Unexpected desktop fixture path.");
  fs.rmSync(resolved, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250,
  });
} catch (error) {
  console.error("Failed to remove chat desktop fixture:", error);
  process.exitCode = 1;
}
if (result.error) {
  console.error("Chat desktop process failed:", result.error);
  process.exitCode = 1;
} else if (result.status !== 0) process.exitCode = result.status || 1;
