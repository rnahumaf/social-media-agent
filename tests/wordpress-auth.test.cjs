const { test } = require("node:test");
const assert = require("node:assert/strict");
const { profile } = require("../core/wordpress-auth.cjs");
const { wordpressAccess } = require("../core/publish.cjs");
test("WordPress.com validates token binding and restricted posts access", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  let allowed = true;
  global.fetch = async (url, options) => {
    const u = new URL(url);
    assert.equal(u.hostname, "public-api.wordpress.com");
    if (u.pathname.endsWith("token-info"))
      return Response.json({
        blog_id: allowed ? "123" : "999",
        scope: "posts media",
      });
    assert.equal(options.headers.Authorization, "Bearer fixture");
    assert.ok(u.pathname.endsWith("/posts/"));
    return Response.json({ found: 0 });
  };
  assert.equal(
    (await profile("fixture", "123", "http://fixture.wordpress.com")).siteUrl,
    "https://fixture.wordpress.com",
  );
  allowed = false;
  await assert.rejects(
    profile("fixture", "123", "https://fixture.wordpress.com"),
    /token/,
  );
});
test("WordPress.com token is routed only to official API instead of site URL", () => {
  const access = wordpressAccess({
    state: {
      settings: {
        wordpressProvider: "wordpress.com",
        wordpressSiteId: "123",
        wordpressUrl: "https://untrusted.example",
      },
    },
    secrets: { wordpressCom: "fixture" },
  });
  assert.equal(
    access.base,
    "https://public-api.wordpress.com/rest/v1.1/sites/123",
  );
  assert.equal(access.authorization, "Bearer fixture");
});
test("Cloudflare isolates WordPress and Instagram sessions", async () => {
  const { AuthSessions } = await import("../auth-service/worker.mjs");
  const { hash } = require("../core/instagram-auth.cjs");
  const w = new AuthSessions(
    {},
    { WORDPRESS_CLIENT_ID: "123", WORDPRESS_CLIENT_SECRET: "fixture" },
  );
  const verifier = "a".repeat(43),
    origin = "https://auth.example.test";
  const s = await (
    await w.fetch(
      new Request(origin + "/wordpress/sessions", {
        method: "POST",
        body: JSON.stringify({ challenge: hash(verifier) }),
      }),
    )
  ).json();
  assert.equal(new URL(s.url).searchParams.get("scope"), "posts media");
  assert.equal(
    (
      await w.fetch(
        new Request(origin + "/sessions/" + s.id, {
          headers: { Authorization: "Bearer " + verifier },
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await w.fetch(
        new Request(origin + "/oauth/callback?state=" + s.id + "&code=x"),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await w.fetch(
        new Request(
          origin + "/wordpress/callback?state=" + s.id + "&error=access_denied",
        ),
      )
    ).status,
    400,
  );
});
