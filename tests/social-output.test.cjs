const test = require("node:test");
const assert = require("node:assert/strict");
const social = require("../core/social-output.cjs");

const valid = (overrides = {}) => ({
  caption: "Legenda #saúde",
  cards: [
    { title: "Pergunta clínica", body: "Comece pela pergunta." },
    { title: "O que muda", body: "Decida com contexto e evidência." },
  ],
  ...overrides,
});

test("social contract accepts fences, boundary lengths, accents and emoji", () => {
  const cases = [
    JSON.stringify(valid()),
    `\n\`\`\`json\n${JSON.stringify(valid())}\n\`\`\`\n`,
    JSON.stringify(
      valid({
        cards: [
          { title: "T".repeat(90), body: "á".repeat(420) },
          { title: "Emoji", body: "Cuidado clínico 🐕" },
        ],
      }),
    ),
    JSON.stringify(
      valid({
        cards: Array.from({ length: 8 }, (_, index) => ({
          title: `Card ${index + 1}`,
          body: "Texto",
        })),
      }),
    ),
  ];
  for (const value of cases) assert.doesNotThrow(() => social.parse(value));
});

test("social contract explains length and cardinality failures without leaking validator payloads", () => {
  assert.throws(
    () =>
      social.parse(
        JSON.stringify(
          valid({
            cards: [
              { title: "T".repeat(91), body: "B".repeat(421) },
              { title: "Segundo", body: "B" },
            ],
          }),
        ),
      ),
    (error) => {
      assert.match(error.message, /texto de card ultrapassa 420/);
      assert.match(error.message, /título ultrapassa 90/);
      assert.doesNotMatch(error.message, /too_big|\"path\"/);
      return true;
    },
  );
  assert.throws(
    () => social.parse(JSON.stringify(valid({ cards: [valid().cards[0]] }))),
    /2 a 8 cards/,
  );
});

test("local fallback divides long text without truncation and refuses malformed structures", () => {
  const longBody = "texto ".repeat(100).trim();
  const source = JSON.stringify(
    valid({
      cards: [
        { title: "Título preservado", body: longBody },
        { title: "Segundo", body: "Outro texto" },
      ],
    }),
  );
  const fitted = social.fitLengths(source);
  assert.equal(fitted.caption, "Legenda #saúde");
  assert.equal(fitted.cards.length, 3);
  assert.equal(fitted.cards[0].title, "Título preservado");
  assert.match(fitted.cards[1].title, /\(2\/2\)$/);
  assert.equal(
    fitted.cards
      .slice(0, 2)
      .map((card) => card.body)
      .join(" "),
    longBody,
  );
  assert.ok(fitted.cards.every((card) => card.body.length <= 420));
  assert.ok(fitted.cards.every((card) => !card.body.endsWith("…")));
  assert.deepEqual(social.splitText("Primeira frase. Segunda frase.", 18), [
    "Primeira frase.",
    "Segunda frase.",
  ]);
  assert.equal(social.fitLengths("não é JSON"), null);
  assert.equal(
    social.fitLengths(JSON.stringify({ caption: "Legenda", cards: [{}] })),
    null,
  );
  const longTitle = "Título ".repeat(20).trim();
  const titleFitted = social.fitLengths(
    JSON.stringify(
      valid({
        cards: [
          { title: longTitle, body: "Texto" },
          { title: "Segundo", body: "Texto" },
        ],
      }),
    ),
  );
  assert.equal(
    `${titleFitted.cards[0].title} ${titleFitted.cards[0].body}`,
    `${longTitle} Texto`,
  );
  assert.ok(titleFitted.cards[0].title.length <= 90);
  assert.doesNotMatch(titleFitted.cards[0].title, /…/);
});

test("local fallback pauses instead of discarding content beyond eight cards", () => {
  const source = JSON.stringify(
    valid({
      cards: Array.from({ length: 8 }, (_, index) => ({
        title: `Card ${index + 1}`,
        body: index === 0 ? "conteúdo ".repeat(100) : "Texto preservado.",
      })),
    }),
  );
  assert.equal(social.fitLengths(source), null);
});
