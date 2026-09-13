const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const providers = require("../core/providers.cjs");
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "research-test-"));
  const w = await Workspace.open(root);
  w.state.settings.demo = false;
  w.state.settings.models = {
    researcher: "research-model",
    writer: "writer-model",
    social: "social-model",
    reviewer: "review-model",
  };
  w.secrets = { openrouter: "fixture-key" };
  const original = { ...providers };
  t.after(() => {
    Object.assign(providers, original);
    try {
      w.close();
    } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  });
  const p = w.create("Otite em cães", "Explicar prevenção aos tutores");
  p.messages.push({ role: "user", content: "Inclua também gatos", at: "now" });
  return { w, p };
}
const source = {
  pmid: "123",
  title: "Fixture",
  access: "abstract",
  abstract: "Fixture evidence",
};
function completion(content, model = "research-model") {
  return { content, model, usage: { total_tokens: 12 } };
}
test("researcher plans from user demand before fetching and preserves generated query on disk", async (t) => {
  const { w, p } = await fixture(t);
  p.query = "obsolete manual query";
  w.update(p.id, {
    title: p.title,
    brief: "Prevenção e cuidados para tutores",
  });
  const calls = [];
  providers.complete = async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      assert.equal(input.model, "research-model");
      const context = JSON.parse(input.messages[0].content);
      assert.equal(context.brief, p.brief);
      assert.equal(context.conversation[0].content, "Inclua também gatos");
      assert.equal(context.query, undefined);
      return completion('{"query":"otitis AND (dogs OR cats)"}');
    }
    assert.ok(p.sources.length);
    return completion(
      input.model === "social-model"
        ? JSON.stringify({
            caption: "Fixture",
            cards: [
              { title: "A", body: "B" },
              { title: "C", body: "D" },
            ],
          })
        : "Fixture evidence [PMID: 123]",
      input.model,
    );
  };
  providers.pubmed = async (query) => {
    assert.equal(calls.length, 1);
    assert.equal(query, "otitis AND (dogs OR cats)");
    return [source];
  };
  await run(w, p.id);
  assert.equal(p.status, "review");
  assert.equal(p.runs.length, 5);
  assert.equal(p.runs[0].phase, "search");
  assert.equal(p.runs[0].usage.total_tokens, 12);
  assert.equal(p.runs[0].resultCount, 1);
  const folder = w.dir;
  const query = p.query;
  assert.equal(p.revisions[0].sources[0].pmid, "123");
  w.close();
  const reopened = await Workspace.open(folder);
  try {
    assert.equal(reopened.project(p.id).query, query);
    assert.equal(reopened.project(p.id).runs[0].query, query);
  } finally {
    reopened.close();
  }
});
test("empty results trigger one autonomous reformulation and never write unsupported content", async (t) => {
  const { w, p } = await fixture(t);
  let plans = 0;
  providers.complete = async (input) => {
    plans++;
    assert.equal(input.model, "research-model");
    const context = JSON.parse(input.messages[0].content);
    if (plans === 2)
      assert.equal(context.previousQuery, "otitis canine prevention");
    return completion(
      JSON.stringify({
        query: plans === 1 ? "otitis canine prevention" : "otitis dogs",
      }),
    );
  };
  const queries = [];
  providers.pubmed = async (query) => {
    queries.push(query);
    return [];
  };
  await assert.rejects(run(w, p.id), /duas buscas/);
  assert.deepEqual(queries, ["otitis canine prevention", "otitis dogs"]);
  assert.equal(plans, 2);
  assert.equal(p.status, "paused");
  assert.equal(p.revisions.length, 0);
  assert.equal(p.runs[1].resultCount, 0);
});
test("invalid search plan fails before PubMed and clears stale sources", async (t) => {
  const { w, p } = await fixture(t);
  p.sources = [source];
  p.query = "old";
  providers.complete = async () => completion('{"query":"  "}');
  providers.pubmed = async () => assert.fail("must not search");
  await assert.rejects(run(w, p.id), /busca válida/);
  assert.equal(p.status, "paused");
  assert.equal(p.runs[0].status, "failed");
  assert.deepEqual(p.sources, []);
  assert.equal(p.query, "");
});
test("cancellation during planning prevents external search", async (t) => {
  const { w, p } = await fixture(t);
  const controller = new AbortController();
  providers.complete = async () => {
    controller.abort();
    return completion('{"query":"otitis"}');
  };
  providers.pubmed = async () => assert.fail("must not search");
  await assert.rejects(run(w, p.id, { signal: controller.signal }));
  assert.equal(p.status, "cancelled");
  assert.equal(p.runs[0].status, "cancelled");
});
test("PubMed service failure is not mistaken for an empty search", async (t) => {
  const { w, p } = await fixture(t);
  let calls = 0;
  providers.complete = async () => {
    calls++;
    return completion('{"query":"otitis"}');
  };
  providers.pubmed = async () => {
    throw Error("Service unavailable");
  };
  await assert.rejects(run(w, p.id), /Service unavailable/);
  assert.equal(calls, 1);
  assert.equal(p.status, "paused");
});

test("missing OpenRouter key reports the real setup problem without changing the project", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = {};
  const before = structuredClone(p);
  await assert.rejects(run(w, p.id), /chave OpenRouter não está salva/);
  assert.deepEqual(p, before);
  assert.equal(w.snapshot().unlocked, true);
  assert.equal(w.snapshot().openrouterConfigured, false);
});

test("locked vault is distinguished from a missing OpenRouter key", async (t) => {
  const { w, p } = await fixture(t);
  w.secrets = null;
  await assert.rejects(run(w, p.id), /cofre está bloqueado/);
  assert.equal(p.status, "briefing");
  assert.equal(w.snapshot().openrouterConfigured, undefined);
});

test("failed work persists and resumes from its saved stage with user steering", async (t) => {
  const { w, p } = await fixture(t);
  let completions = 0;
  providers.complete = async () => {
    completions++;
    if (completions === 1) return completion('{"query":"otitis dogs"}');
    throw Error("Falha transitória do modelo");
  };
  providers.pubmed = async () => [source];

  await assert.rejects(run(w, p.id), /Falha transitória/);
  const sessionId = p.sessions[0].id;
  assert.equal(p.status, "paused");
  assert.equal(p.sessions[0].status, "paused");
  assert.equal(p.sessions[0].cursor, "researcher");
  assert.equal(p.sources[0].pmid, "123");
  assert.ok(
    p.sessions[0].events.some(
      (event) =>
        event.kind === "tool_result" && event.title === "1 fonte encontrada",
    ),
  );
  assert.ok(p.sessions[0].events.some((event) => event.kind === "error"));

  const folder = w.dir;
  w.close();
  const reopened = await Workspace.open(folder);
  reopened.secrets = { openrouter: "fixture-key" };
  try {
    let pubmedCalls = 0;
    providers.pubmed = async () => {
      pubmedCalls++;
      return [];
    };
    providers.complete = async (input) =>
      completion(
        input.model === "social-model"
          ? JSON.stringify({
              caption: "Fixture",
              cards: [
                { title: "A", body: "B" },
                { title: "C", body: "D" },
              ],
            })
          : "Conteúdo retomado [PMID: 123]",
        input.model,
      );
    await run(reopened, p.id, {
      resume: true,
      instruction: "Mantenha as fontes encontradas e seja mais direto.",
    });
    const resumed = reopened.project(p.id);
    assert.equal(pubmedCalls, 0);
    assert.equal(resumed.sessions.length, 1);
    assert.equal(resumed.sessions[0].id, sessionId);
    assert.equal(resumed.sessions[0].status, "completed");
    assert.equal(resumed.sessions[0].cursor, "done");
    assert.equal(resumed.sources[0].pmid, "123");
    assert.equal(resumed.revisions.length, 1);
    assert.ok(
      resumed.sessions[0].events.some(
        (event) =>
          event.kind === "user" && event.detail.includes("mais direto"),
      ),
    );
    assert.ok(
      resumed.messages.some(
        (message) =>
          message.role === "user" && message.content.includes("mais direto"),
      ),
    );
  } finally {
    reopened.close();
  }
});

test("an unfinished legacy run becomes a resumable session without losing sources", async (t) => {
  const { w, p } = await fixture(t);
  p.status = "failed";
  p.query = "otitis dogs";
  p.sources = [source];
  p.sessions = [];
  p.runs = [
    {
      id: "legacy-search",
      role: "researcher",
      phase: "search",
      model: "research-model",
      status: "completed",
      resultCount: 1,
      startedAt: "2026-01-01T10:00:00.000Z",
      finishedAt: "2026-01-01T10:01:00.000Z",
    },
    {
      id: "legacy-dossier",
      role: "researcher",
      model: "research-model",
      status: "failed",
      startedAt: "2026-01-01T10:01:00.000Z",
      finishedAt: "2026-01-01T10:02:00.000Z",
    },
  ];
  w.save();
  const folder = w.dir;
  w.close();

  const reopened = await Workspace.open(folder);
  try {
    const migrated = reopened.project(p.id);
    assert.equal(migrated.status, "paused");
    assert.equal(migrated.sources[0].pmid, "123");
    assert.equal(migrated.sessions.length, 1);
    assert.equal(migrated.sessions[0].cursor, "researcher");
    assert.equal(migrated.sessions[0].artifacts.sources[0].pmid, "123");
    assert.ok(
      migrated.sessions[0].events.some(
        (event) => event.title === "1 fonte preservada",
      ),
    );
  } finally {
    reopened.close();
  }
});

test("an invalid agent output is saved before validation pauses the session", async (t) => {
  const { w, p } = await fixture(t);
  providers.pubmed = async () => [source];
  providers.complete = async (input) => {
    if (input.system.includes("Retorne somente JSON"))
      return completion('{"query":"otitis dogs"}');
    if (input.model === "research-model")
      return completion("Dossiê preservado [PMID: 123]", input.model);
    if (input.model === "writer-model")
      return completion("# Artigo parcial preservado", input.model);
    if (input.model === "social-model")
      return completion("saída social inválida, mas preservada", input.model);
    return completion("Revisão", input.model);
  };

  await assert.rejects(
    run(w, p.id),
    /não conseguiu entregar um carrossel válido após a correção automática/,
  );
  const session = p.sessions[0];
  assert.equal(session.status, "paused");
  assert.equal(session.cursor, "social");
  assert.equal(session.artifacts.article, "# Artigo parcial preservado");
  assert.equal(p.revisions.length, 0);
  assert.ok(
    session.artifacts.responses.some(
      (response) =>
        response.role === "social" &&
        response.content === "saída social inválida, mas preservada",
    ),
  );
  assert.equal(
    session.artifacts.responses.filter(
      (response) => response.role === "social" && response.phase === "repair",
    ).length,
    1,
  );
  assert.ok(!session.error.includes('"code"'));
  assert.ok(
    session.events.some((event) => event.title === "Correção automática salva"),
  );
});

test("an overlong social response is condensed automatically without repeating earlier stages", async (t) => {
  const { w, p } = await fixture(t);
  providers.pubmed = async () => [source];
  let socialCalls = 0;
  providers.complete = async (input) => {
    if (input.system.includes("Retorne somente JSON"))
      return completion('{"query":"otitis dogs"}');
    if (input.model === "social-model") {
      socialCalls++;
      if (socialCalls === 1) {
        assert.equal(input.responseFormat?.type, "json_schema");
        return completion(
          JSON.stringify({
            caption: "Legenda",
            cards: [
              { title: "Primeiro", body: "A".repeat(500) },
              { title: "Segundo", body: "B".repeat(421) },
            ],
          }),
          input.model,
        );
      }
      assert.match(input.system, /Corrija a saída/);
      assert.equal(input.responseFormat?.json_schema?.strict, true);
      return completion(
        JSON.stringify({
          caption: "Legenda preservada",
          cards: [
            { title: "Primeiro", body: "Texto condensado A" },
            { title: "Segundo", body: "Texto condensado B" },
          ],
        }),
        input.model,
      );
    }
    return completion("Conteúdo [PMID: 123]", input.model);
  };

  await run(w, p.id);
  assert.equal(p.status, "review");
  assert.equal(socialCalls, 2);
  assert.equal(p.runs.filter((item) => item.role === "researcher").length, 2);
  assert.equal(p.revisions[0].cards[0].body, "Texto condensado A");
  assert.ok(
    p.sessions[0].events.some(
      (event) => event.title === "Carrossel corrigido automaticamente",
    ),
  );
});

test("valid JSON with only excessive lengths has a deterministic fallback when repair is unavailable", async (t) => {
  const { w, p } = await fixture(t);
  providers.pubmed = async () => [source];
  let socialCalls = 0;
  providers.complete = async (input) => {
    if (input.system.includes("Retorne somente JSON"))
      return completion('{"query":"otitis dogs"}');
    if (input.model === "social-model") {
      socialCalls++;
      if (socialCalls === 2) throw Error("Falha transitória na correção");
      return completion(
        JSON.stringify({
          caption: "Legenda",
          cards: [
            { title: "Título ".repeat(20), body: "Corpo ".repeat(100) },
            { title: "Segundo", body: "Outro corpo ".repeat(50) },
          ],
        }),
        input.model,
      );
    }
    return completion("Conteúdo [PMID: 123]", input.model);
  };

  await run(w, p.id);
  assert.equal(p.status, "review");
  assert.equal(socialCalls, 2);
  assert.ok(p.revisions[0].cards.every((card) => card.title.length <= 90));
  assert.ok(p.revisions[0].cards.every((card) => card.body.length <= 420));
  assert.ok(
    p.sessions[0].events.some(
      (event) => event.title === "Limites aplicados pelo aplicativo",
    ),
  );
});

test("retry reuses a saved length-only social output before making another social call", async (t) => {
  const { w, p } = await fixture(t);
  providers.pubmed = async () => [source];
  providers.complete = async (input) => {
    if (input.system.includes("Retorne somente JSON"))
      return completion('{"query":"otitis dogs"}');
    if (input.model === "social-model")
      return completion("resposta estruturalmente inválida", input.model);
    return completion("Conteúdo [PMID: 123]", input.model);
  };
  await assert.rejects(run(w, p.id));
  const session = p.sessions[0];
  session.artifacts.responses.push({
    id: "saved-social",
    role: "social",
    content: JSON.stringify({
      caption: "Legenda salva",
      cards: [
        { title: "Primeiro", body: "A".repeat(500) },
        { title: "Segundo", body: "B".repeat(500) },
      ],
    }),
    at: "now",
  });
  w.save();

  let socialCalls = 0;
  providers.complete = async (input) => {
    if (input.model === "social-model") socialCalls++;
    return completion("Revisão concluída", input.model);
  };
  await run(w, p.id, { resume: true });
  assert.equal(socialCalls, 0);
  assert.equal(p.status, "review");
  assert.ok(p.revisions[0].cards.every((card) => card.body.length <= 420));
  assert.ok(
    session.events.some(
      (event) => event.title === "Resposta anterior recuperada",
    ),
  );
});
