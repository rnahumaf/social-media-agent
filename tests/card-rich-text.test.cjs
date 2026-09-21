const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const {
  richTextPlain,
  textDocument,
  cardText,
  cardTextKey,
} = require("../core/card-rich-text.mjs");
const {
  cardSchema,
  defaultStyle,
  scopedContext,
} = require("../core/editorial-model.cjs");
const { cardTextSchema } = require("../core/card-text-schema.cjs");
const {
  svgCard,
  cardLayout,
  renderJPEGs,
  previewCards,
} = require("../core/render.cjs");
const social = require("../core/social-output.cjs");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const providers = require("../core/providers.cjs");
const span = (text, ...marks) => ({
  type: "text",
  text,
  marks: marks.map((type) => ({ type })),
});
const paragraph = (content, indent = 0) => ({
  type: "paragraph",
  attrs: { indent },
  content,
});
const item = (...content) => ({ type: "listItem", content });
const titleRich = {
  type: "doc",
  content: [
    paragraph([span("Texto ", "bold"), span("com estilo", "bold", "italic")]),
  ],
};
const bodyRich = {
  type: "doc",
  content: [
    paragraph([
      span("Destaque", "bold"),
      span(", "),
      span("ênfase", "italic"),
      span(" e "),
      span("sublinhado", "underline"),
      span("."),
    ]),
    {
      type: "bulletList",
      content: [
        item(paragraph([span("Primeiro item.")]), {
          type: "bulletList",
          content: [item(paragraph([span("Detalhe com recuo.", "italic")]))],
        }),
        item(paragraph([span("Segundo item.", "bold")])),
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [
        item(paragraph([span("Passo numerado.")])),
        item(paragraph([span("Próximo passo.")])),
      ],
    },
    paragraph(
      [
        span("Parágrafo recuado."),
        { type: "hardBreak" },
        span("Outra linha.", "underline"),
      ],
      1,
    ),
  ],
};
const richCard = () => ({
  title: richTextPlain(titleRich),
  body: richTextPlain(bodyRich),
  titleRich: structuredClone(titleRich),
  bodyRich: structuredClone(bodyRich),
});
test("rewrite comparison ignores JSON key order and detects format-only changes", () => {
  const card = richCard();
  const reordered = JSON.parse(JSON.stringify(card), (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse())
      : value,
  );
  assert.equal(cardTextKey(card), cardTextKey(cardTextSchema.parse(reordered)));
  reordered.bodyRich.content[0].content[0].marks.push({ type: "italic" });
  assert.notEqual(cardTextKey(card), cardTextKey(reordered));
});
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rich-cards-"));
  const w = await Workspace.open(path.join(root, "workspace"));
  const p = w.create("Formatação", "", "", {
    manual: true,
    channels: ["blog", "instagram"],
  });
  w.revise(p.id, {
    ...current(p),
    article: "Artigo da fixture.",
    caption: "Legenda da fixture.",
    cards: [richCard(), { title: "Outro card", body: "Texto simples." }],
  });
  t.after(() => {
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, w, p };
}

test("rich text contract preserves legacy cards and validates visible text, nesting and supported marks", () => {
  const plain = { title: "Antigo", body: "Texto **literal**" };
  assert.deepEqual(cardSchema.parse(plain), plain);
  const card = richCard();
  assert.deepEqual(cardTextSchema.parse(card), card);
  assert.ok(JSON.stringify(card.bodyRich).length > 420);
  assert.throws(
    () => cardSchema.parse({ ...card, body: "Texto diferente" }),
    /mesmo texto/,
  );
  assert.throws(() =>
    cardSchema.parse({
      ...card,
      bodyRich: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "https://example.test" } }],
      },
    }),
  );
  assert.throws(() =>
    cardSchema.parse({
      ...card,
      titleRich: {
        type: "doc",
        content: [paragraph([span(card.title, "link")])],
      },
    }),
  );
  let nested = paragraph([span("x")]);
  for (let i = 0; i < 100; i++)
    nested = { type: "bulletList", content: [item(paragraph([]), nested)] };
  assert.throws(
    () =>
      cardSchema.parse({
        title: "",
        body: "x",
        bodyRich: { type: "doc", content: [nested] },
      }),
    /complexa/,
  );
});

test("render preserves marks, list markers, numbering, indentation, line breaks and escaping", async () => {
  const card = richCard();
  const svg = svgCard(card, 0, 2);
  assert.match(svg, /font-weight="bold"[^>]*>Destaque/);
  assert.match(svg, /font-style="italic"[^>]*>ênfase/);
  assert.match(svg, /text-decoration="underline"[^>]*>sublinhado/);
  assert.match(svg, />•<\/text>/);
  assert.match(svg, />3\.<\/text>/);
  assert.match(svg, />4\.<\/text>/);
  const layout = cardLayout(card);
  assert.ok(layout.body.some((line) => line.x > 180));
  const last = layout.body.at(-1);
  assert.ok(layout.bodyY + last.y <= 1160);
  const escaped = {
    title: "<script>",
    body: "& <imagem>",
    bodyRich: textDocument("& <imagem>"),
  };
  assert.doesNotMatch(svgCard(escaped, 0, 1), /<script>|<imagem>/);
  for (const font of ["sans", "serif"]) {
    const [jpeg] = await renderJPEGs(".", [card], { ...defaultStyle, font });
    if (process.env.STUDIO_CAPTURE_DIR) {
      fs.mkdirSync(process.env.STUDIO_CAPTURE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(process.env.STUDIO_CAPTURE_DIR, `rich-mixed-${font}.jpg`),
        jpeg,
      );
    }
    const meta = await require("sharp")(jpeg).metadata();
    assert.equal(meta.width, 1080);
    assert.equal(meta.height, 1350);
    const [preview] = await previewCards(".", [card], {
      ...defaultStyle,
      font,
    });
    assert.ok(jpeg.equals(Buffer.from(preview.image.split(",")[1], "base64")));
  }
});

test("numbered items and continuation paragraphs share a gutter; empty rich cards remain editable", async () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 9 },
        content: [
          item(paragraph([span("Nove.")]), paragraph([span("Continuação.")])),
          item(paragraph([span("Dez.")])),
        ],
      },
    ],
  };
  const layout = cardLayout({
    title: "Lista",
    body: richTextPlain(doc),
    bodyRich: doc,
  });
  assert.equal(new Set(layout.body.map((line) => line.x)).size, 1);
  const [preview] = await previewCards(".", [
    {
      title: "",
      body: "",
      titleRich: textDocument(""),
      bodyRich: textDocument(""),
    },
  ]);
  assert.equal(preview.incomplete, true);
  assert.ok(preview.image);
  const card = {
    title: "",
    body: "Só o corpo.",
    bodyRich: textDocument("Só o corpo."),
  };
  assert.equal(
    cardLayout(card).bodyY,
    cardLayout({ title: card.title, body: card.body }).bodyY,
  );
});

test("wrapping keeps marks inside words and rejects overflow without cutting text", () => {
  const body = "WWW Árvore ".repeat(30).slice(0, 420);
  const rich = textDocument(body);
  rich.content[0].content = [
    span(body.slice(0, 15), "bold"),
    span(body.slice(15), "italic", "underline"),
  ];
  const layout = cardLayout({ title: "Conteúdo denso", body, bodyRich: rich });
  assert.equal(
    layout.body
      .flatMap((line) => line.spans.map((part) => part.text))
      .join("")
      .replace(/\s/g, ""),
    body.replace(/\s/g, ""),
  );
  const manyLines = Array.from({ length: 25 }, () =>
    paragraph([span("linha")]),
  );
  const doc = { type: "doc", content: manyLines };
  assert.throws(
    () => svgCard({ title: "", body: richTextPlain(doc), bodyRich: doc }, 0, 1),
    /não cabe/,
  );
  assert.equal(
    cardLayout({ title: "Linhas", body: "Primeira\nSegunda" }).body.length,
    2,
  );
});

test("format-only edits persist in drafts and portable history, change JPEGs and invalidate approval", async (t) => {
  const { root, w, p } = await fixture(t);
  const revision = current(p);
  await w.approve(p.id, "instagram");
  assertApproved(p, w.state.settings, "instagram");
  const before = await renderJPEGs(w.dir, revision.cards, revision.style);
  const cards = structuredClone(revision.cards);
  cards[0].bodyRich.content[0].content[0].marks.push({ type: "underline" });
  w.saveDraft({
    id: p.id,
    baseRevisionId: revision.id,
    content: { ...revision, cards },
  });
  w.backup(path.join(root, "copy"));
  const copy = await Workspace.open(path.join(root, "copy"));
  try {
    assert.deepEqual(copy.snapshot().projects[0].draft.content.cards, cards);
    assert.deepEqual(current(copy.project(p.id)).cards, revision.cards);
    const rendered = await renderJPEGs(
      copy.dir,
      revision.cards,
      revision.style,
    );
    assert.ok(rendered[0].equals(before[0]));
  } finally {
    copy.close();
  }
  w.revise(p.id, { ...revision, cards });
  assert.equal(current(p).cards[0].body, revision.cards[0].body);
  assert.deepEqual(p.revisions.at(-2).cards, revision.cards);
  assert.throws(() => assertApproved(p, w.state.settings, "instagram"));
  const after = await renderJPEGs(w.dir, current(p).cards, revision.style);
  assert.ok(!before[0].equals(after[0]));
  await w.approve(p.id, "instagram");
  const approved = await require("../core/publish.cjs").approvedImages(
    w,
    p,
    current(p),
  );
  assert.ok(approved[0].equals(after[0]));
});

test("social generation, repair, scoped context and rewrite expose and preserve rich text", async (t) => {
  const { w, p } = await fixture(t);
  const socialValue = {
    caption: "Legenda",
    cards: [richCard(), { title: "Outro", body: "Texto" }],
  };
  assert.deepEqual(social.parse(JSON.stringify(socialValue)), socialValue);
  assert.deepEqual(social.fitLengths(JSON.stringify(socialValue)), socialValue);
  const invalid = structuredClone(socialValue);
  invalid.cards[0].body = "alterado";
  assert.equal(social.fitLengths(JSON.stringify(invalid)), null);
  assert.match(
    social.responseFormat.json_schema.schema.$defs.cardDocument.type,
    /object/,
  );
  assert.deepEqual(
    scopedContext(p, "social", {}, current(p)).previous.cards[0],
    cardText(current(p).cards[0]),
  );
  const original = providers.complete;
  t.after(() => {
    providers.complete = original;
  });
  w.secrets = { openrouter: "fixture" };
  w.state.settings.models = { social: "social", reviewer: "reviewer" };
  providers.complete = async (options) => {
    if (options.model === "social") {
      assert.match(options.system, /sublinhado/);
      assert.ok(options.responseFormat.json_schema.schema.$defs.cardDocument);
      return {
        content: JSON.stringify(socialValue),
        model: "social",
        usage: {},
      };
    }
    assert.match(options.messages[0].content, /bodyRich/);
    return { content: "Revisado.", model: "reviewer", usage: {} };
  };
  await require("../core/pipeline.cjs").run(w, p.id, {
    mode: "adapt",
    targets: ["instagram"],
  });
  assert.deepEqual(current(p).cards, socialValue.cards);
  providers.complete = async (options) => {
    assert.deepEqual(JSON.parse(options.messages[0].content).text, richCard());
    assert.match(options.system, /Preserve formatação existente/);
    assert.ok(options.responseFormat.json_schema.schema.properties.bodyRich);
    return { content: JSON.stringify(richCard()), model: "social", usage: {} };
  };
  const result = await require("../core/rewrite.cjs").rewrite(w, {
    id: p.id,
    target: "card",
    card: richCard(),
    baseRevisionId: current(p).id,
  });
  assert.deepEqual(result.value, richCard());
});
