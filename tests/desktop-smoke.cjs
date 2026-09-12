// Runs the real isolated renderer and IPC against disposable fixtures.
const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-desktop-"));
let folder = path.join(root, "workspace");
fs.mkdirSync(folder);
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
const realFetch = global.fetch;
let instagramOpened = false;
shell.openExternal = async (url) => {
  assert.ok(
    ["https://www.instagram.com", "https://public-api.wordpress.com"].includes(
      new URL(url).origin,
    ),
  );
  instagramOpened = true;
};
global.fetch = async (url, options = {}) => {
  const u = new URL(url);
  if (u.hostname === "social-media-agent-auth-alpha.rnahumaf.workers.dev") {
    if (u.pathname.startsWith("/wordpress/"))
      return Response.json(
        u.pathname === "/wordpress/sessions"
          ? {
              id: "w".repeat(43),
              url: "https://public-api.wordpress.com/oauth2/authorize?scope=posts+media",
            }
          : options.method === "DELETE"
            ? { status: "cancelled" }
            : {
                status: "ready",
                token: "wordpress-fixture-token",
                siteId: "456",
                siteUrl: "http://fixture.wordpress.com",
              },
      );
    if (u.pathname === "/sessions")
      return Response.json({
        id: "s".repeat(43),
        url: "https://www.instagram.com/oauth/authorize?scope=instagram_business_basic%2Cinstagram_business_content_publish",
      });
    return Response.json(
      options.method === "DELETE"
        ? { status: "cancelled" }
        : {
            status: "ready",
            token: "desktop-fixture-token",
            expiresAt: Date.now() + 60000,
          },
    );
  }
  if (u.hostname === "graph.instagram.com")
    return Response.json({ user_id: "123", username: "desktop_fixture" });
  if (u.hostname === "public-api.wordpress.com")
    return Response.json(
      u.pathname.endsWith("token-info")
        ? { blog_id: "456", scope: "posts media" }
        : { found: 0 },
    );
  return realFetch(url, options);
};
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
    await call("vault", { password: "desktop-fixture-password" });
    let connected = await call("instagramConnect");
    assert.equal(connected.settings.instagramUsername, "desktop_fixture");
    assert.ok(instagramOpened);
    assert.ok(!JSON.stringify(connected).includes("desktop-fixture-token"));
    await call("instagramTest");
    connected = await call("wordpressConnect");
    assert.equal(connected.settings.wordpressSiteId, "456");
    assert.ok(!JSON.stringify(connected).includes("wordpress-fixture-token"));
    await call("wordpressTest");
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
    await call("vault", { password: "desktop-fixture-password" });
    state = await call("instagramDisconnect");
    assert.equal(state.settings.instagramAccount, "");
    state = await call("wordpressDisconnect");
    assert.equal(state.settings.wordpressSiteId, "");
    console.log(
      "Desktop smoke passed: isolated preload, pipeline, JPEG, export, transferred workspace and mocked Instagram/WordPress OAuth IPC.",
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
