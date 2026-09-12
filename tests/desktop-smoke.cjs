// Runs the real isolated renderer and IPC against disposable fixtures.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-desktop-"));
let folder = path.join(root, "workspace");
fs.mkdirSync(folder);
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
require(process.env.STUDIO_TEST_ENTRY || "../electron/main.cjs");
app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    win.hide();
    await new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    const call = (method, payload) =>
      win.webContents.executeJavaScript(
        `window.studio[${JSON.stringify(method)}](${JSON.stringify(payload)})`,
      );
    assert.equal(
      await win.webContents.executeJavaScript("typeof require"),
      "undefined",
    );
    await call("open");
    let state = await call("create", {
      title: "Fixture editorial",
      brief: "Somente teste",
      query: "science",
    });
    const id = state.projects[0].id;
    state = await call("run", { id });
    assert.equal(state.projects[0].revisions.length, 1);
    const images = await call("render", {
      cards: state.projects[0].revisions[0].cards,
    });
    assert.ok(images[0].startsWith("data:image/jpeg;base64,"));
    await call("approve", { id, channel: "export" });
    folder = path.join(root, "export");
    fs.mkdirSync(folder);
    await call("export", { id });
    assert.ok(fs.existsSync(path.join(folder, "card-1.jpg")));
    folder = path.join(root, "backup");
    fs.mkdirSync(folder);
    await call("backup");
    await call("open");
    state = await call("state");
    assert.equal(state.projects[0].id, id);
    assert.equal(state.projects[0].revisions.length, 1);
    console.log(
      "Desktop smoke passed: isolated preload, pipeline, JPEG, export and transferred workspace.",
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exitCode = 1;
    app.exit(1);
  }
});
app.on("quit", () => {
  fs.rmSync(root, { recursive: true, force: true });
});
