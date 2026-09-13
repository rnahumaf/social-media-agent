const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createService } = require("../auth-service/server.cjs");
const { hash, serviceURL } = require("../core/instagram-auth.cjs");
const { Workspace } = require("../core/workspace.cjs");
test("desktop completes OAuth and verifies identity without exposing token to browser", async (t) => {
  const { connect } = require("../core/instagram-auth.cjs");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let opened = "",
    checked = false;
  global.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname === "/sessions")
      return Response.json({
        id: "s".repeat(43),
        url: "https://www.instagram.com/oauth/authorize?scope=instagram_business_basic%2Cinstagram_business_content_publish",
      });
    if (options.method === "DELETE")
      return Response.json({ status: "cancelled" });
    if (u.hostname === "graph.instagram.com") {
      checked = true;
      assert.equal(options.headers.Authorization, "Bearer fixture-token");
      return Response.json({ user_id: "123", username: "fixture_account" });
    }
    return Response.json({
      status: "ready",
      token: "fixture-token",
      expiresAt: Date.now() + 60000,
      accountId: "123",
      mediaToken: "m".repeat(50),
    });
  };
  const result = await connect({
    service: "https://auth.example.test",
    openBrowser: async (url) => {
      opened = url;
    },
  });
  assert.equal(result.username, "fixture_account");
  assert.equal(result.mediaToken, "m".repeat(50));
  assert.ok(checked);
  assert.ok(!opened.includes("fixture-token"));
});
test("Cloudflare Instagram callback issues temporary-media access bound to the authorized account", async (t) => {
  const { AuthSessions } = await import("../auth-service/worker.mjs");
  const previous = global.fetch;
  t.after(() => {
    global.fetch = previous;
  });
  let exchange = 0;
  global.fetch = async () => {
    exchange++;
    return exchange === 1
      ? Response.json({
          data: [
            {
              access_token: "short-token",
              user_id: "123",
              permissions: [
                "instagram_business_basic",
                "instagram_business_content_publish",
              ],
            },
          ],
        })
      : Response.json({ access_token: "long-token", expires_in: 3600 });
  };
  const worker = new AuthSessions(
    {},
    {
      INSTAGRAM_APP_ID: "app-id",
      INSTAGRAM_APP_SECRET: "app-secret",
      MEDIA_SIGNING_SECRET: "media-secret",
    },
  );
  const verifier = crypto.randomBytes(32).toString("base64url");
  const origin = "https://auth.example.test";
  const session = await (
    await worker.fetch(
      new Request(origin + "/sessions", {
        method: "POST",
        body: JSON.stringify({ challenge: hash(verifier) }),
      }),
    )
  ).json();
  assert.equal(
    (
      await worker.fetch(
        new Request(
          origin + "/oauth/callback?state=" + session.id + "&code=fixture",
        ),
      )
    ).status,
    200,
  );
  const result = await (
    await worker.fetch(
      new Request(origin + "/sessions/" + session.id, {
        headers: { Authorization: "Bearer " + verifier },
      }),
    )
  ).json();
  assert.equal(result.status, "ready");
  assert.equal(result.accountId, "123");
  assert.ok(result.mediaToken.length >= 80);
  assert.equal(exchange, 2);
});
test("OAuth binds delivery to desktop verifier, consumes state and delivers once", async (t) => {
  let calls = 0,
    time = 1000;
  const server = createService({
    origin: "https://auth.example.test",
    appId: "123",
    appSecret: "fixture",
    now: () => time,
    exchange: async () => {
      calls++;
      return { token: "fixture-token", expiresAt: 900000 };
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const verifier = crypto.randomBytes(32).toString("base64url");
  const start = async () =>
    (
      await fetch(base + "/sessions", {
        method: "POST",
        body: JSON.stringify({ challenge: hash(verifier) }),
      })
    ).json();
  const session = await start();
  assert.equal(
    new URL(session.url).searchParams.get("scope"),
    "instagram_business_basic,instagram_business_content_publish",
  );
  assert.equal(
    (await fetch(base + "/oauth/callback?state=invalid&code=x")).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/sessions/" + session.id, {
        headers: { Authorization: "Bearer " + "a".repeat(43) },
      })
    ).status,
    404,
  );
  assert.equal(
    (await fetch(base + "/oauth/callback?state=" + session.id + "&code=x"))
      .status,
    200,
  );
  assert.equal(
    (await fetch(base + "/oauth/callback?state=" + session.id + "&code=x"))
      .status,
    400,
  );
  assert.equal(calls, 1);
  const options = { headers: { Authorization: "Bearer " + verifier } };
  const result = await (
    await fetch(base + "/sessions/" + session.id, options)
  ).json();
  assert.equal(result.token, "fixture-token");
  assert.equal(
    (await fetch(base + "/sessions/" + session.id, options)).status,
    404,
  );
  const denied = await start();
  await fetch(
    base + "/oauth/callback?state=" + denied.id + "&error=access_denied",
  );
  assert.equal(
    (await (await fetch(base + "/sessions/" + denied.id, options)).json())
      .status,
    "failed",
  );
  const expired = await start();
  time += 600001;
  assert.equal(
    (await fetch(base + "/sessions/" + expired.id, options)).status,
    404,
  );
});
test("OAuth token persists only in encrypted vault and can be removed after reopen", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ig-auth-"));
  let w = await Workspace.open(dir);
  t.after(() => {
    w.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.throws(() => w.storeSecret("instagram", "fixture-token"), /cofre/);
  w.unlock("fixture-password");
  w.storeSecret("instagram", "fixture-token");
  assert.ok(
    !fs
      .readFileSync(path.join(dir, "vault.enc"), "utf8")
      .includes("fixture-token"),
  );
  assert.ok(!JSON.stringify(w.snapshot()).includes("fixture-token"));
  w.close();
  w = await Workspace.open(dir);
  w.unlock("fixture-password");
  assert.equal(w.secrets.instagram, "fixture-token");
  w.storeSecret("instagram", null);
  w.lockVault();
  assert.equal(w.vaultKey, null);
  w.unlock("fixture-password");
  assert.equal(w.secrets.instagram, undefined);
});
test("auth service requires a clean HTTPS origin", () => {
  for (const url of [
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test/?token=x",
  ])
    assert.throws(() => serviceURL(url));
});
