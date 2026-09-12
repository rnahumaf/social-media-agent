const test = require("node:test"),
  assert = require("node:assert/strict");
const { complete, pubmed } = require("../core/providers.cjs");
test("OpenRouter request uses selected model, bounded output and no provider fallback", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "fixture/model");
    assert.equal(body.max_tokens, 5000);
    assert.equal(body.provider.allow_fallbacks, false);
    return {
      ok: true,
      json: async () => ({
        model: "fixture/model",
        choices: [{ message: { content: "Resposta" }, finish_reason: "stop" }],
        usage: { total_tokens: 42 },
      }),
    };
  };
  try {
    const result = await complete({
      key: "fixture",
      model: "fixture/model",
      system: "Teste",
      messages: [],
    });
    assert.equal(result.usage.total_tokens, 42);
  } finally {
    global.fetch = original;
  }
});
test("PubMed distinguishes abstracts from metadata using returned identifiers", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () =>
    ++calls === 1
      ? {
          ok: true,
          json: async () => ({ esearchresult: { idlist: ["123", "456"] } }),
        }
      : {
          ok: true,
          text: async () =>
            '<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123</PMID><Article><ArticleTitle>Estudo A</ArticleTitle><Abstract><AbstractText>Resumo consultado</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle><PubmedArticle><MedlineCitation><PMID>456</PMID><Article><ArticleTitle>Estudo B</ArticleTitle></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>',
        };
  try {
    const result = await pubmed("fixture");
    assert.equal(result[0].access, "abstract");
    assert.equal(result[1].access, "metadata");
    assert.equal(result[0].url, "https://pubmed.ncbi.nlm.nih.gov/123/");
  } finally {
    global.fetch = original;
  }
});
test("truncated generation does not become a draft", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        { message: { content: "Texto cortado" }, finish_reason: "length" },
      ],
    }),
  });
  try {
    await assert.rejects(
      () =>
        complete({
          key: "fixture",
          model: "fixture",
          system: "",
          messages: [],
        }),
      /excedeu/,
    );
  } finally {
    global.fetch = original;
  }
});
