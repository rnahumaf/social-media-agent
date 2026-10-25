// Synthetic checks against the final signed runtime and packaged application resources.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

async function coreSmoke(archive) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sma-package-core-"));
  let workspace;
  try {
    const { Workspace } = require(path.join(archive, "core/workspace.cjs"));
    const sharp = require(path.join(archive, "node_modules/sharp"));
    const { renderJPEGs } = require(path.join(archive, "core/render.cjs"));
    workspace = await Workspace.open(root);
    workspace.state.memory = "Synthetic signed-package persistence check";
    workspace.save();
    workspace.unlock("synthetic-package-password", {
      openrouter: "synthetic-not-a-key",
    });
    workspace.close();
    workspace = null;
    workspace = await Workspace.open(root);
    assert.equal(
      workspace.state.memory,
      "Synthetic signed-package persistence check",
    );
    workspace.unlock("synthetic-package-password");
    assert.equal(workspace.secrets.openrouter, "synthetic-not-a-key");
    const images = await renderJPEGs(root, [
      { title: "Assinatura ARM64", body: "Texto sintético: ação e memória." },
    ]);
    const metadata = await sharp(images[0]).metadata();
    assert.equal(metadata.format, "jpeg");
    assert.equal(metadata.width, 1080);
    assert.equal(metadata.height, 1350);
    console.log(
      `Signed runtime ${process.versions.electron}, ${process.arch}: packaged Sharp/JPEG, SQLite persistence and encrypted vault passed.`,
    );
  } finally {
    workspace?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main(appPath) {
  const executable = path.join(appPath, "Contents/MacOS/Social Media Agent");
  const archive = path.join(appPath, "Contents/Resources/app.asar");
  const core = spawnSync(executable, [__filename, "--core", archive], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 60000,
  });
  process.stdout.write(core.stdout || "");
  process.stderr.write(core.stderr || "");
  assert.ifError(core.error);
  assert.equal(core.status, 0, "Packaged core smoke failed");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sma-package-ui-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(
    executable,
    [
      "--user-data-dir=" + root,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
    ],
    { env, stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  try {
    let target;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error(`Packaged app exited before rendering: ${stderr}`);
      const portFile = path.join(root, "DevToolsActivePort");
      if (fs.existsSync(portFile)) {
        const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
        try {
          const targets = await fetch(
            `http://127.0.0.1:${port}/json/list`,
          ).then((r) => r.json());
          target = targets.find(
            (t) => t.type === "page" && t.url.includes("/dist/index.html"),
          );
          if (target) break;
        } catch {
          /* Chromium may still be starting. */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(target, `Packaged renderer did not start: ${stderr}`);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("Renderer inspection timeout")),
        10000,
      );
      socket.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.id === 1) {
          clearTimeout(timeout);
          resolve(response);
        }
      };
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression:
              "new Promise(resolve=>{const timer=setInterval(()=>{if(window.studio && document.body?.innerText.trim().length>20){clearInterval(timer);resolve({bridge:typeof window.studio,text:document.body.innerText,isolated:typeof require})}},100)})",
            awaitPromise: true,
            returnByValue: true,
          },
        }),
      );
    });
    socket.close();
    const value = result.result?.result?.value;
    assert.equal(value?.bridge, "object");
    assert.equal(value?.isolated, "undefined");
    assert.ok(value?.text?.trim().length > 20, "Packaged UI is empty");
    console.log(
      "Final signed app launched with isolated preload and rendered its UI; no workspace or external services opened.",
    );
  } finally {
    child.kill("SIGKILL");
    await new Promise((resolve) =>
      child.exitCode !== null || child.signalCode !== null
        ? resolve()
        : child.once("exit", resolve),
    );
    fs.rmSync(root, { recursive: true, force: true });
  }
}

(process.argv[2] === "--core"
  ? coreSmoke(process.argv[3])
  : main(path.resolve(process.argv[2]))
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
