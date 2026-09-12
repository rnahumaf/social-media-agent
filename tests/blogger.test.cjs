const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const blogger = require("../core/blogger.cjs");
const { Workspace, current } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
test("Blogger binds approval to selected blog, refreshes encrypted credential and blocks uncertain retry", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blogger-fixture-"));
  const w = await Workspace.open(root);
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
    w.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  w.unlock("fixture-password-long");
  const p = w.create("Teste", "Brief", "query");
  await run(w, p.id);
  w.state.settings.demo = false;
  current(p).demo = false;
  Object.assign(w.state.settings, {
    bloggerId: "123",
    bloggerUrl: "https://fixture.blogspot.com",
  });
  w.storeSecret(
    "blogger",
    JSON.stringify({
      token: "old",
      refreshToken: "refresh-fixture-token-long",
      expiresAt: 0,
    }),
  );
  let publications = 0,
    refreshes = 0,
    uncertain = false;
  global.fetch = async (url, options) => {
    const u = new URL(url);
    if (u.pathname === "/blogger/refresh") {
      refreshes++;
      assert.equal(
        options.headers.Authorization,
        "Bearer refresh-fixture-token-long",
      );
      return Response.json({
        token: "new-fixture",
        expiresAt: Date.now() + 3600000,
      });
    }
    assert.equal(u.origin, "https://www.googleapis.com");
    assert.equal(options.headers.Authorization, "Bearer new-fixture");
    if (u.pathname.endsWith("/users/self/blogs"))
      return Response.json({
        items: [
          { id: "123", name: "Fixture", url: "http://fixture.blogspot.com/" },
        ],
      });
    publications++;
    assert.equal(
      u.pathname,
      "/blogger/v3/blogs/123/posts" + (publications === 1 ? "" : "/456"),
    );
    if (uncertain) throw Error("timeout");
    assert.equal(JSON.parse(options.body).title, "Teste");
    return Response.json({
      id: "456",
      blog: { id: "123" },
      status: "LIVE",
      url: "https://fixture.blogspot.com/post",
    });
  };
  await assert.rejects(
    blogger.publish(w, p.id, "https://auth.example.test"),
    /Aprove/,
  );
  w.approve(p.id, "blogger");
  w.state.settings.bloggerId = "999";
  await assert.rejects(
    blogger.publish(w, p.id, "https://auth.example.test"),
    /Aprove/,
  );
  w.state.settings.bloggerId = "123";
  await blogger.publish(w, p.id, "https://auth.example.test");
  await blogger.publish(w, p.id, "https://auth.example.test");
  assert.equal(publications, 1);
  assert.equal(refreshes, 1);
  assert.ok(!JSON.stringify(w.snapshot()).includes("new-fixture"));
  assert.ok(
    !fs
      .readFileSync(path.join(root, "vault.enc"), "utf8")
      .includes("refresh-fixture"),
  );
  w.revise(p.id, { ...current(p), article: "Alteração" });
  w.approve(p.id, "blogger");
  uncertain = true;
  await assert.rejects(
    blogger.publish(w, p.id, "https://auth.example.test"),
    /incerto/,
  );
  await assert.rejects(
    blogger.publish(w, p.id, "https://auth.example.test"),
    /incerto/,
  );
  assert.equal(publications, 2);
});
test("Blogger OAuth uses isolated single-use sessions and Google token endpoint", async (t) => {
  const { AuthSessions } = await import("../auth-service/worker.mjs");
  const { hash } = require("../core/instagram-auth.cjs");
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const worker = new AuthSessions(
    {},
    {
      GOOGLE_CLIENT_ID: "fixture-client",
      GOOGLE_CLIENT_SECRET: "fixture-secret",
    },
  );
  const origin = "https://auth.example.test",
    verifier = "a".repeat(43);
  const session = await (
    await worker.fetch(
      new Request(origin + "/blogger/sessions", {
        method: "POST",
        body: JSON.stringify({ challenge: hash(verifier) }),
      }),
    )
  ).json();
  const url = new URL(session.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(
    url.searchParams.get("scope"),
    "https://www.googleapis.com/auth/blogger",
  );
  global.fetch = async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    assert.equal(options.body.get("client_secret"), "fixture-secret");
    return Response.json({
      access_token: "fixture-token",
      refresh_token: "fixture-refresh",
      expires_in: 3600,
      scope: "https://www.googleapis.com/auth/blogger",
    });
  };
  assert.equal(
    (
      await worker.fetch(
        new Request(
          origin + "/wordpress/callback?state=" + session.id + "&code=fixture",
        ),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(
          origin + "/blogger/callback?state=" + session.id + "&code=fixture",
        ),
      )
    ).status,
    200,
  );
  const req = () =>
    new Request(origin + "/blogger/sessions/" + session.id, {
      headers: { Authorization: "Bearer " + verifier },
    });
  const result = await (await worker.fetch(req())).json();
  assert.equal(result.refreshToken, "fixture-refresh");
  assert.equal((await worker.fetch(req())).status, 404);
  assert.equal(
    (
      await worker.fetch(
        new Request(origin + "/blogger/refresh", { method: "POST" }),
      )
    ).status,
    401,
  );
});
