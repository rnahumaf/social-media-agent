const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const { defaultStyle } = require("../core/editorial-model.cjs");
const { run } = require("../core/pipeline.cjs");
const { rewrite } = require("../core/rewrite.cjs");
const providers = require("../core/providers.cjs");
const { importImage, readImage } = require("../core/assets.cjs");
const { renderJPEGs } = require("../core/render.cjs");
const { approvedImages } = require("../core/publish.cjs");
async function fixture(t, options) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-beta-"));
  const w = await Workspace.open(path.join(root, "workspace"), options);
  const original = { ...providers };
  t.after(() => {
    Object.assign(providers, original);
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { w, root };
}
const cards = [
  { title: "Um título", body: "Texto do primeiro card." },
  { title: "Outro título", body: "Texto do segundo card." },
];
const completion = (content, model) => ({
  content,
  model,
  usage: { total_tokens: 12 },
});
function setupAI(w) {
  w.secrets = { openrouter: "fixture-key" };
  w.state.settings.models = {
    researcher: "research",
    writer: "writer",
    social: "social",
    reviewer: "reviewer",
  };
}

test("manual content persists without AI and approval validates only the requested channel", async (t) => {
  const { w } = await fixture(t);
  assert.equal(w.state.settings.demo, false);
  assert.deepEqual(w.state.settings.research, ["pubmed", "web"]);
  const p = w.create("Manual", "", "", {
    manual: true,
    channels: ["blog", "instagram"],
  });
  assert.equal(p.runs.length, 0);
  await assert.rejects(w.approve(p.id, "blogger"), /Escreva o artigo/);
  w.revise(p.id, {
    ...current(p),
    article: "# Artigo manual",
    cards: [{ title: "", body: "" }],
  });
  await w.approve(p.id, "blogger");
  assertApproved(p, w.state.settings, "blogger");
  await assert.rejects(w.approve(p.id, "instagram"), /legenda/);
  w.update(p.id, { title: p.title, brief: p.brief, channels: ["blog"] });
  await assert.rejects(w.approve(p.id, "instagram"), /não está selecionado/);
  const dir = w.dir;
  w.close();
  const copy = await Workspace.open(dir);
  try {
    assert.equal(current(copy.project(p.id)).article, "# Artigo manual");
    assert.equal(current(copy.project(p.id)).demo, false);
    assert.deepEqual(copy.project(p.id).channels, ["blog"]);
  } finally {
    copy.close();
  }
});
test("Instagram-only manual content needs no article and media approval survives portable copy", async (t) => {
  const { w, root } = await fixture(t);
  const file = path.join(root, "image.png");
  await require("sharp")({
    create: { width: 600, height: 400, channels: 3, background: "#277799" },
  })
    .png()
    .toFile(file);
  const image = await importImage(w.dir, file);
  assert.match(image.path, /^assets\//);
  const p = w.create("Instagram manual", "", "", {
    manual: true,
    channels: ["instagram"],
  });
  w.revise(p.id, {
    ...current(p),
    cards: cards.map((c) => ({ ...c, image })),
    caption: "Legenda manual",
    style: {
      ...defaultStyle,
      layout: "split",
      font: "serif",
      fontScale: 1.15,
      signature: "Autor",
    },
  });
  await w.approve(p.id, "instagram");
  const expected = await approvedImages(w, p, current(p));
  w.backup(path.join(root, "copy"));
  const copy = await Workspace.open(path.join(root, "copy"));
  try {
    assertApproved(copy.project(p.id), copy.state.settings, "instagram");
    assert.equal(current(copy.project(p.id)).style.fontScale, 1.15);
    const actual = await approvedImages(
      copy,
      copy.project(p.id),
      current(copy.project(p.id)),
    );
    assert.ok(actual[0].equals(expected[0]));
  } finally {
    copy.close();
  }
  assert.throws(() => readImage(w.dir, { ...image, path: "../outside.png" }));
  fs.appendFileSync(path.join(w.dir, image.path), "changed");
  await assert.rejects(approvedImages(w, p, current(p)), /alterada fora/);
});
test("style and title changes invalidate approval; rendering consumes styles and crop", async (t) => {
  const { w } = await fixture(t);
  const p = w.create("Título", "", "", { channels: ["instagram"] });
  w.revise(p.id, { article: "", cards, caption: "Legenda", demo: false });
  await w.approve(p.id, "instagram");
  p.title = "Outro";
  assert.throws(() => assertApproved(p, w.state.settings, "instagram"));
  p.title = "Título";
  const old = (await renderJPEGs(w.dir, cards, defaultStyle))[0];
  w.revise(p.id, {
    ...current(p),
    style: { ...defaultStyle, background: "#aabbcc" },
  });
  assert.equal(p.approval, null);
  const next = (await renderJPEGs(w.dir, cards, current(p).style))[0];
  assert.ok(!old.equals(next));
});
test("legacy demo migration retains history, defaults to PubMed and does not make demos publishable", async (t) => {
  const { w } = await fixture(t, { testMode: true });
  const p = w.create("Antiga", "");
  await run(w, p.id);
  delete w.state.editorialVersion;
  delete w.state.knowledge;
  delete w.state.settings.research;
  w.state.memory = "Voz do autor";
  w.save();
  const dir = w.dir;
  w.close();
  const migrated = await Workspace.open(dir);
  try {
    assert.equal(migrated.state.knowledge.general, "Voz do autor");
    assert.deepEqual(migrated.state.settings.research, ["pubmed"]);
    assert.equal(migrated.state.settings.demo, false);
    assert.equal(current(migrated.project(p.id)).demo, true);
    assert.equal(migrated.project(p.id).approval, null);
    assert.equal(migrated.project(p.id).sessions.length, 1);
  } finally {
    migrated.close();
  }
});
test("blog generation excludes old Instagram material and preserves the other channel", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  w.state.settings.research = ["pubmed"];
  const p = w.create("Tema", "Escreva blog e Instagram", "", {
    manual: true,
    channels: ["blog", "instagram"],
  });
  w.revise(p.id, {
    ...current(p),
    article: "# Blog anterior",
    caption: "MARCADOR_INSTAGRAM",
    cards,
    sources: [
      {
        pmid: "122",
        title: "Fonte anterior",
        url: "https://pubmed.ncbi.nlm.nih.gov/122/",
      },
    ],
  });
  providers.pubmed = async () => [
    {
      pmid: "123",
      title: "Fonte",
      url: "https://pubmed.ncbi.nlm.nih.gov/123/",
      abstract: "Resumo",
      access: "abstract",
    },
  ];
  const models = [];
  providers.complete = async (input) => {
    models.push(input.model);
    if (models.length === 1)
      return completion('{"provider":"pubmed","query":"tema"}', input.model);
    if (input.model === "writer") {
      assert.ok(!input.messages[0].content.includes("MARCADOR_INSTAGRAM"));
      assert.match(input.system, /exclusivamente o artigo do BLOG/);
      return completion("# Somente o blog", input.model);
    }
    return completion("Evidências e revisão", input.model);
  };
  await run(w, p.id, { targets: ["blog"] });
  assert.ok(!models.includes("social"));
  assert.equal(current(p).article, "# Somente o blog");
  assert.equal(current(p).caption, "MARCADOR_INSTAGRAM");
  assert.deepEqual(current(p).cards, cards);
  assert.deepEqual(
    current(p).sources.map((s) => s.pmid),
    ["122", "123"],
  );
  w.state.settings.bloggerId = "123";
  w.state.settings.bloggerUrl = "https://fixture.blogspot.com";
  w.state.settings.instagramAccount = "1789000";
  w.secrets.blogger = JSON.stringify({
    token: "fixture",
    refreshToken: "fixture-refresh",
    expiresAt: Date.now() + 3600000,
  });
  const previousFetch = global.fetch;
  t.after(() => (global.fetch = previousFetch));
  let published = 0;
  global.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, "www.googleapis.com");
    if (url.includes("/users/self/blogs"))
      return Response.json({
        items: [
          { id: "123", name: "Fixture", url: "https://fixture.blogspot.com" },
        ],
      });
    published++;
    const payload = JSON.parse(options.body);
    assert.match(payload.content, /Somente o blog/);
    assert.ok(!payload.content.includes("MARCADOR_INSTAGRAM"));
    assert.ok(!payload.content.includes(cards[0].body));
    return Response.json({
      id: "456",
      blog: { id: "123" },
      status: "LIVE",
      url: "https://fixture.blogspot.com/post",
    });
  };
  await w.approve(p.id, "blogger");
  await require("../core/blogger.cjs").publish(w, p.id);
  assert.equal(published, 1);
  assert.equal(p.publications.instagram, undefined);
});

test("scoped resumption preserves the blog and rejects edits after a pause", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  const p = w.create("Tema", "", "", {
    manual: true,
    channels: ["blog", "instagram"],
  });
  w.revise(p.id, {
    ...current(p),
    article: "# Blog intocado",
    cards,
    caption: "Legenda anterior",
  });
  providers.pubmed = async () => [
    {
      pmid: "123",
      title: "Fonte",
      abstract: "Resumo",
      access: "abstract",
      url: "https://pubmed.ncbi.nlm.nih.gov/123/",
    },
  ];
  let fail = true;
  providers.complete = async (input) => {
    if (input.system.includes("Escolha uma das ferramentas"))
      return completion('{"provider":"pubmed","query":"tema"}', input.model);
    if (input.model === "social" && fail) throw Error("falha de rede");
    assert.notEqual(input.model, "writer");
    return completion(
      input.model === "social"
        ? JSON.stringify({ caption: "Legenda nova", cards })
        : "Evidências e revisão",
      input.model,
    );
  };
  await assert.rejects(
    run(w, p.id, { targets: ["instagram"] }),
    /falha de rede/,
  );
  fail = false;
  await run(w, p.id, { resume: true });
  assert.equal(current(p).article, "# Blog intocado");
  assert.equal(current(p).caption, "Legenda nova");
  fail = true;
  await assert.rejects(run(w, p.id, { targets: ["instagram"] }));
  w.revise(p.id, { ...current(p), article: "# Edição após pausa" });
  await assert.rejects(run(w, p.id, { resume: true }), /editado após a pausa/);
  assert.equal(current(p).article, "# Edição após pausa");
});

test("partial generation keeps legacy demo provenance; fresh full generation replaces it", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  const p = w.create("Tema", "", "", { channels: ["blog", "instagram"] });
  w.revise(p.id, {
    article: "Demonstração antiga",
    cards,
    caption: "Legenda fictícia",
    demo: true,
  });
  providers.pubmed = async () => [
    {
      pmid: "123",
      title: "Fonte",
      abstract: "Resumo",
      access: "abstract",
      url: "https://pubmed.ncbi.nlm.nih.gov/123/",
    },
  ];
  providers.complete = async (input) =>
    completion(
      input.system.includes("Escolha uma das ferramentas")
        ? '{"provider":"pubmed","query":"tema"}'
        : input.model === "social"
          ? JSON.stringify({ caption: "Legenda nova", cards })
          : "Texto novo",
      input.model,
    );
  await run(w, p.id, { targets: ["blog"] });
  assert.equal(current(p).demo, true);
  await run(w, p.id);
  assert.equal(current(p).demo, false);
  assert.equal(p.revisions[0].demo, true);
});

test("blog preview and publishers share Markdown rendering without executable links", async () => {
  const { renderBlog } = await import("../core/blog-html.mjs");
  const html = renderBlog(
    "# Artigo\n\n**Texto** [fonte](https://example.test) [ruim](javascript:alert%281%29)\n\n<script>alert(1)</script>",
  );
  assert.match(html, /<h1>Artigo<\/h1>/);
  assert.match(html, /<strong>Texto<\/strong>/);
  assert.match(html, /href="https:\/\/example.test"/);
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes("<script>"));
  assert.match(
    renderBlog("![Imagem antiga](https://example.test/image.png)"),
    /<img src="https:\/\/example.test\/image.png"/,
  );
});
test("Instagram generation can start from evidence without a writer or blog", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  delete w.state.settings.models.writer;
  w.state.settings.research = ["web"];
  const p = w.create("Tema aberto", "", "", { channels: ["instagram"] });
  let planned = false;
  providers.complete = async (input) => {
    assert.notEqual(input.model, "writer");
    if (!planned) {
      planned = true;
      return completion('{"provider":"web","query":"tema"}', input.model);
    }
    return completion(
      input.model === "social"
        ? JSON.stringify({ caption: "Legenda", cards })
        : "Revisão",
      input.model,
    );
  };
  providers.web = async () => ({
    sources: [
      {
        id: "web-1",
        provider: "web",
        title: "Fonte web",
        url: "https://example.test/article",
        abstract: "Trecho",
        access: "excerpt",
      },
    ],
    usage: { total_tokens: 4 },
  });
  await run(w, p.id);
  assert.equal(current(p).article, "");
  assert.equal(current(p).cards.length, 2);
  assert.equal(p.sessions[0].artifacts.searches[0].provider, "web");
});
test("search enforces permissions and does not accept fictional results when the web has no citations", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  w.state.settings.research = ["pubmed"];
  const p = w.create("Tema", "");
  providers.complete = async () =>
    completion('{"provider":"web","query":"tema"}', "research");
  providers.web = async () => assert.fail("disabled web must not run");
  await assert.rejects(run(w, p.id), /não permitida/);
  w.state.settings.research = ["web"];
  providers.web = async () => ({ sources: [], usage: {} });
  await assert.rejects(run(w, p.id), /duas buscas/);
  assert.equal(p.revisions.length, 0);
});
test("web adapter exposes only returned URL citations and sends bounded external search tools", async (t) => {
  const original = global.fetch;
  t.after(() => (global.fetch = original));
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.tools[0].type, "openrouter:web_search");
    assert.equal(body.tools[0].parameters.engine, "exa");
    return Response.json({
      model: "fixture",
      choices: [
        {
          message: {
            content: "Texto com um link inventado https://fake.example",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  title: "Fonte",
                  url: "https://example.test/source",
                  content: "Trecho consultado",
                },
              },
              {
                type: "url_citation",
                url_citation: { url: "javascript:alert(1)" },
              },
            ],
          },
        },
      ],
    });
  };
  const result = await providers.web("tema", {
    key: "fixture",
    model: "fixture",
  });
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].access, "excerpt");
  assert.equal(result.sources[0].url, "https://example.test/source");
});
test("rewrite is a proposal scoped to the selected text and preserves all revisions", async (t) => {
  const { w } = await fixture(t);
  setupAI(w);
  w.state.knowledge = {
    general: "Natural",
    blog: "Parágrafos curtos",
    instagram: "Frases curtas",
    examples: "Meu exemplo",
  };
  w.state.memory = "Natural";
  const p = w.create("Tema", "", "", {
    manual: true,
    channels: ["blog", "instagram"],
  });
  w.revise(p.id, {
    ...current(p),
    article: "Texto original",
    caption: "MARCADOR_PRIVADO_SOCIAL",
    cards,
  });
  const revision = current(p);
  providers.complete = async (input) => {
    assert.ok(!JSON.stringify(input).includes("MARCADOR_PRIVADO_SOCIAL"));
    assert.ok(!input.webSearch);
    assert.match(input.system, /Skill editorial ativa: rn-natural-writing/);
    assert.match(input.system, /Parágrafos curtos/);
    return completion("Texto melhorado", input.model);
  };
  const result = await rewrite(w, {
    id: p.id,
    target: "article",
    text: revision.article,
    baseRevisionId: revision.id,
    instruction: "Seja direto",
  });
  assert.equal(result.value, "Texto melhorado");
  assert.equal(current(p).id, revision.id);
  assert.equal(current(p).article, "Texto original");
  await assert.rejects(
    rewrite(w, {
      id: p.id,
      target: "article",
      text: "Texto",
      baseRevisionId: "old",
    }),
    /revisão mudou/,
  );
});
