const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { Workspace } = require("../core/workspace.cjs");
const { svgCard } = require("../core/render.cjs");
const { instagram } = require("../core/publish.cjs");

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "instagram-fixture-"));
  const w = await Workspace.open(dir);
  t.after(() => {
    w.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  w.state.settings.demo = false;
  w.state.settings.instagramAccount = "123456789";
  w.secrets = { instagram: "fixture-token-not-real" };
  const p = w.create("Fixture de integração", "Teste sem acesso externo", "");
  const cards = [
    { title: "Primeiro card", body: "Conteúdo fictício." },
    { title: "Segundo card", body: "Somente teste automatizado." },
  ];
  w.revise(p.id, { article: "# Fixture", caption: "Legenda de teste", cards });
  const images = await Promise.all(
    cards.map((c, i) =>
      sharp(Buffer.from(svgCard(c, i, cards.length)))
        .jpeg({ quality: 95 })
        .toBuffer(),
    ),
  );
  const urls = [
    "https://media.example/card-1.jpg",
    "https://media.example/card-2.jpg",
  ];
  return { w, p, images, urls };
}

function mockFetch(t, images, failPublish = false) {
  const original = global.fetch,
    calls = [];
  t.after(() => {
    global.fetch = original;
  });
  global.fetch = async (url, options = {}) => {
    calls.push({
      url,
      method: options.method || "GET",
      body: options.body ? JSON.parse(options.body) : undefined,
    });
    if (url.startsWith("https://media.example/")) {
      assert.equal(
        options.headers?.Authorization,
        undefined,
        "Do not send Meta token to media host",
      );
      return {
        ok: true,
        arrayBuffer: async () => images[url.includes("card-1") ? 0 : 1],
      };
    }
    assert.equal(
      options.headers.Authorization,
      "Bearer fixture-token-not-real",
    );
    assert.ok(url.startsWith("https://graph.instagram.com/v23.0/"));
    if (url.endsWith("/media_publish")) {
      if (failPublish) throw Error("simulated transport failure");
      return { ok: true, json: async () => ({ id: "published-fixture" }) };
    }
    if (url.includes("fields=status_code"))
      return { ok: true, json: async () => ({ status_code: "FINISHED" }) };
    return {
      ok: true,
      json: async () => ({ id: "container-" + calls.length }),
    };
  };
  return calls;
}

test("Instagram blocks publication before approval and missing token before any request", async (t) => {
  const { w, p, urls, images } = await fixture(t),
    calls = mockFetch(t, images);
  await assert.rejects(() => instagram(w, p.id, urls), /Aprove/);
  w.approve(p.id, "instagram");
  w.secrets = null;
  await assert.rejects(() => instagram(w, p.id, urls), /token/);
  assert.equal(calls.length, 0);
});

test("Instagram verifies exact JPEGs before creating ordered carousel containers", async (t) => {
  const { w, p, urls, images } = await fixture(t),
    calls = mockFetch(t, images);
  w.approve(p.id, "instagram");
  const result = await instagram(w, p.id, urls);
  assert.equal(result.status, "published");
  assert.equal(result.remoteId, "published-fixture");
  assert.deepEqual(
    calls.slice(2, 4).map((c) => c.body.image_url),
    urls,
  );
  assert.deepEqual(calls[4].body.children, ["container-3", "container-4"]);
  assert.equal(calls[5].method, "GET");
  assert.equal(calls[6].body.creation_id, "container-5");
  assert.equal(result.children.length, 2);
  await assert.rejects(() => instagram(w, p.id, urls), /Já existe/);
  assert.equal(calls.length, 7, "No duplicate publication");
});

test("Instagram rejects changed public image without creating remote containers", async (t) => {
  const { w, p, urls, images } = await fixture(t);
  images[0] = Buffer.from("altered image");
  const calls = mockFetch(t, images);
  w.approve(p.id, "instagram");
  await assert.rejects(() => instagram(w, p.id, urls), /difere/);
  assert.equal(calls.length, 1);
  assert.equal(p.publications.instagram, undefined);
});

test("Instagram keeps container IDs and blocks retry after uncertain publish", async (t) => {
  const { w, p, urls, images } = await fixture(t),
    calls = mockFetch(t, images, true);
  w.approve(p.id, "instagram");
  await assert.rejects(() => instagram(w, p.id, urls), /não confirmada/);
  assert.equal(p.publications.instagram.status, "uncertain");
  assert.equal(p.publications.instagram.containerId, "container-5");
  await assert.rejects(() => instagram(w, p.id, urls), /Já existe/);
  assert.equal(calls.length, 7);
});
