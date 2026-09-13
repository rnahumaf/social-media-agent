const test = require("node:test");
const assert = require("node:assert/strict");
const { upload, remove, mediaURL } = require("../core/media-host.cjs");

test("temporary media client accepts only its configured HTTPS service", async (t) => {
  const original = global.fetch;
  t.after(() => {
    global.fetch = original;
  });
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  let removed = false;
  global.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer " + "t".repeat(50));
    if (options.method === "POST") {
      assert.equal(options.headers["Content-Type"], "image/jpeg");
      assert.deepEqual(options.body, image);
      return Response.json(
        {
          id: "m".repeat(43),
          url: "https://auth.example.test/media/123/" + "m".repeat(43) + ".jpg",
        },
        { status: 201 },
      );
    }
    assert.equal(
      url,
      "https://auth.example.test/media/123/" + "m".repeat(43) + ".jpg",
    );
    removed = true;
    return Response.json({ status: "removed" });
  };
  const item = await upload("https://auth.example.test", "t".repeat(50), image);
  await remove("https://auth.example.test", "t".repeat(50), item);
  assert.equal(removed, true);
  assert.throws(
    () =>
      mediaURL(
        "https://auth.example.test",
        "https://other.example/media/123/" + "m".repeat(43) + ".jpg",
      ),
    /endereço de imagem inválido/,
  );
});

test("Cloudflare media route authenticates uploads, serves exact JPEGs and removes them", async () => {
  const { AuthSessions, createMediaToken } =
    await import("../auth-service/worker.mjs");
  const objects = new Map();
  const bucket = {
    put: async (key, value) => objects.set(key, Uint8Array.from(value)),
    get: async (key) => {
      const value = objects.get(key);
      return value ? { body: value, size: value.length } : null;
    },
    delete: async (key) => objects.delete(key),
  };
  const secret = "fixture-media-signing-secret";
  const worker = new AuthSessions(
    {},
    { MEDIA_SIGNING_SECRET: secret, MEDIA: bucket },
  );
  const token = await createMediaToken(secret, "123", Date.now() + 60000);
  const image = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const created = await worker.fetch(
    new Request("https://auth.example.test/media", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "image/jpeg",
      },
      body: image,
    }),
  );
  assert.equal(created.status, 201);
  const item = await created.json();
  const fetched = await worker.fetch(new Request(item.url));
  assert.equal(fetched.status, 200);
  assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()), image);

  const other = await createMediaToken(secret, "456", Date.now() + 60000);
  assert.equal(
    (
      await worker.fetch(
        new Request(item.url, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + other },
        }),
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request(item.url, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        }),
      )
    ).status,
    200,
  );
  assert.equal((await worker.fetch(new Request(item.url))).status, 404);
});
