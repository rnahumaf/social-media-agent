const test = require("node:test"),
  assert = require("node:assert/strict");
const { complete, pubmed } = require("../core/providers.cjs");
test("OpenRouter keeps the selected model and permits provider failover", async () => {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, "fixture/model");
    assert.equal(body.max_tokens, 5000);
    assert.equal(body.provider.allow_fallbacks, true);
    assert.deepEqual(body.reasoning, { effort: "low", exclude: true });
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
test("OpenRouter requires a provider that honors a requested JSON schema", async () => {
  const original = global.fetch;
  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "fixture",
      strict: true,
      schema: { type: "object", properties: {}, additionalProperties: false },
    },
  };
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, responseFormat);
    assert.equal(body.provider.require_parameters, true);
    return {
      ok: true,
      json: async () => ({
        model: "fixture/model",
        choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      }),
    };
  };
  try {
    assert.equal(
      (
        await complete({
          key: "fixture",
          model: "fixture/model",
          system: "Teste",
          messages: [],
          responseFormat,
        })
      ).content,
      "{}",
    );
  } finally {
    global.fetch = original;
  }
});
test("OpenRouter retries a short 429 once and reports a persistent limit", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return {
      ok: false,
      status: 429,
      headers: { get: () => "0" },
    };
  };
  try {
    await assert.rejects(
      () =>
        complete({
          key: "fixture",
          model: "fixture/model",
          system: "Teste",
          messages: [],
        }),
      /OpenRouter limitou as chamadas.*limites da chave.*saldo/,
    );
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
  }
});
test("OpenRouter continues when the short 429 retry succeeds", async () => {
  const original = global.fetch;
  let calls = 0;
  global.fetch = async () =>
    ++calls === 1
      ? {
          ok: false,
          status: 429,
          headers: { get: () => "0" },
        }
      : {
          ok: true,
          json: async () => ({
            model: "fixture/model",
            choices: [
              { message: { content: "Resposta" }, finish_reason: "stop" },
            ],
          }),
        };
  try {
    const result = await complete({
      key: "fixture",
      model: "fixture/model",
      system: "Teste",
      messages: [],
    });
    assert.equal(result.content, "Resposta");
    assert.equal(calls, 2);
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
      /consumiu o limite.*trabalho concluído foi preservado/,
    );
  } finally {
    global.fetch = original;
  }
});
test("text content parts are normalized into the final response", async () => {
  const original = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "Resposta " },
              { type: "text", text: "completa" },
            ],
          },
          finish_reason: "stop",
        },
      ],
    }),
  });
  try {
    const result = await complete({
      key: "fixture",
      model: "fixture",
      system: "",
      messages: [],
    });
    assert.equal(result.content, "Resposta completa");
  } finally {
    global.fetch = original;
  }
});
