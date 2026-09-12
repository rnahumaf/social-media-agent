const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hash } = require("../core/instagram-auth.cjs");
test("Cloudflare sessions reject denial, enforce verifier, rate limit and consume concurrently once", async () => {
  const { AuthSessions } = await import("../auth-service/worker.mjs");
  const worker = new AuthSessions(
    {},
    { INSTAGRAM_APP_ID: "123", INSTAGRAM_APP_SECRET: "fixture" },
  );
  const origin = "https://auth.example.test";
  const verifier = "a".repeat(43);
  const start = async () =>
    worker.fetch(
      new Request(origin + "/sessions", {
        method: "POST",
        body: JSON.stringify({ challenge: hash(verifier) }),
      }),
    );
  const session = await (await start()).json();
  const auth = { headers: { Authorization: "Bearer " + verifier } };
  assert.equal(
    (
      await worker.fetch(
        new Request(origin + "/oauth/callback?state=bad&code=x"),
      )
    ).status,
    400,
  );
  await worker.fetch(
    new Request(
      origin + "/oauth/callback?state=" + session.id + "&error=access_denied",
    ),
  );
  assert.equal(
    (
      await (
        await worker.fetch(
          new Request(origin + "/sessions/" + session.id, auth),
        )
      ).json()
    ).status,
    "failed",
  );
  const ready = await (await start()).json();
  worker.sessions.get(ready.id).status = "ready";
  worker.sessions.get(ready.id).result = {
    token: "fixture-token",
    expiresAt: Date.now() + 100000,
  };
  assert.equal(
    (await worker.fetch(new Request(origin + "/sessions/" + ready.id))).status,
    404,
  );
  const responses = await Promise.all([
    worker.fetch(new Request(origin + "/sessions/" + ready.id, auth)),
    worker.fetch(new Request(origin + "/sessions/" + ready.id, auth)),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404]);
  for (let i = 0; i < 8; i++) await start();
  assert.equal((await start()).status, 429);
});
