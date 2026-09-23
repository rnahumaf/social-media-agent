const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace, current } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const { rewrite } = require("../core/rewrite.cjs");
const providers = require("../core/providers.cjs");

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-limits-"));
  const w = await Workspace.open(dir);
  w.secrets = { openrouter: "fixture" };
  w.state.settings.research = ["pubmed"];
  w.state.settings.models = {
    researcher: "researcher",
    writer: "writer",
    reviewer: "reviewer",
  };
  const p = w.create("Tema fictício", "Artigo para o blog", "", {
    channels: ["blog"],
  });
  const original = { ...providers };
  t.after(() => {
    Object.assign(providers, original);
    w.close();
    const resolved = fs.realpathSync(dir);
    if (
      path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
      !path.basename(resolved).startsWith("pipeline-limits-")
    )
      throw Error("Unexpected pipeline fixture path.");
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  providers.pubmed = async () => [
    {
      pmid: "123",
      title: "Fonte de teste",
      abstract: "Resumo fictício",
      access: "abstract",
      url: "https://pubmed.ncbi.nlm.nih.gov/123/",
    },
  ];
  return { w, p };
}

test("blog-only flow recovers evidence and review limits without pausing or losing usage", async (t) => {
  const { w, p } = await fixture(t);
  const calls = [];
  providers.complete = async (input) => {
    calls.push({ model: input.model, maxTokens: input.maxTokens });
    const attempt = calls.filter((call) => call.model === input.model).length;
    const limited =
      (input.model === "researcher" && attempt === 2) ||
      (input.model === "reviewer" && attempt === 1);
    const content =
      input.model === "researcher" && attempt === 1
        ? '{"provider":"pubmed","query":"fixture"}'
        : input.model === "researcher"
          ? "Dossiê fictício [PMID: 123]"
          : input.model === "writer"
            ? "# Artigo fictício [PMID: 123]"
            : "Revisão fictícia [PMID: 123]";
    return {
      content: limited ? "Texto parcial" : content,
      model: input.model,
      finishReason: limited ? "length" : "stop",
      usage: { total_tokens: 10 * attempt },
    };
  };

  await run(w, p.id);

  assert.equal(p.status, "review");
  assert.equal(p.sessions[0].status, "completed");
  assert.equal(p.sessions[0].artifacts.partial, undefined);
  assert.equal(current(p).article, "# Artigo fictício [PMID: 123]");
  assert.equal(
    p.runs.find((item) => item.role === "researcher" && !item.phase).usage
      .total_tokens,
    50,
  );
  assert.equal(
    p.runs.find((item) => item.role === "reviewer").usage.total_tokens,
    30,
  );
  assert.deepEqual(
    calls
      .filter((call) => call.model === "researcher")
      .map((call) => call.maxTokens),
    [800, 3000, 9000],
  );
  assert.deepEqual(
    calls
      .filter((call) => call.model === "reviewer")
      .map((call) => call.maxTokens),
    [3000, 9000],
  );
  assert.equal(
    p.sessions[0].artifacts.responses.filter(
      (item) => item.finishReason === "length",
    ).length,
    2,
  );
  assert.ok(
    p.sessions[0].events.some(
      (event) => event.title === "Nova tentativa automática",
    ),
  );
});

test("persistent length pauses with saved attempts and resumes at the maximum limit", async (t) => {
  const { w, p } = await fixture(t);
  const limits = [];
  let completed = false;
  providers.complete = async (input) => {
    if (input.system.includes("Escolha uma das ferramentas"))
      return {
        content: '{"provider":"pubmed","query":"fixture"}',
        model: input.model,
        usage: {},
      };
    limits.push(input.maxTokens);
    return {
      content: completed ? "Dossiê completo [PMID: 123]" : "Dossiê parcial",
      model: input.model,
      finishReason: completed ? "stop" : "length",
      usage: { total_tokens: 11 },
    };
  };

  await assert.rejects(run(w, p.id), /limite máximo/);
  assert.equal(p.sessions[0].cursor, "researcher");
  assert.equal(p.sessions[0].artifacts.partial.content, "Dossiê parcial");
  assert.equal(p.runs.at(-1).usage.total_tokens, 22);
  assert.equal(current(p), undefined);
  completed = true;
  await run(w, p.id, { resume: true });
  assert.deepEqual(limits.slice(0, 3), [3000, 9000, 9000]);
  assert.equal(p.status, "review");
});

test("a completion arriving after cancellation records usage but cannot advance a stage", async (t) => {
  const { w, p } = await fixture(t);
  const controller = new AbortController();
  providers.complete = async (input) => {
    if (input.system.includes("Escolha uma das ferramentas"))
      return {
        content: '{"provider":"pubmed","query":"fixture"}',
        model: input.model,
        usage: {},
      };
    controller.abort();
    return {
      content: "Dossiê tardio [PMID: 123]",
      model: input.model,
      finishReason: "stop",
      usage: { total_tokens: 27 },
    };
  };

  await assert.rejects(run(w, p.id, { signal: controller.signal }));
  assert.equal(p.status, "cancelled");
  assert.equal(p.sessions[0].cursor, "researcher");
  assert.equal(p.sessions[0].artifacts.dossier, undefined);
  assert.equal(p.runs.at(-1).usage.total_tokens, 27);
  assert.equal(current(p), undefined);
});

test("a length-marked social JSON is regenerated instead of reused on resume", async (t) => {
  const { w, p } = await fixture(t);
  w.update(p.id, { title: p.title, brief: p.brief, channels: ["instagram"] });
  w.state.settings.models.social = "social";
  let socialCalls = 0;
  providers.complete = async (input) => {
    if (input.system.includes("Escolha uma das ferramentas"))
      return {
        content: '{"provider":"pubmed","query":"fixture"}',
        model: input.model,
        usage: {},
      };
    if (input.model === "social") {
      socialCalls++;
      return {
        content: JSON.stringify({
          caption:
            socialCalls < 3 ? "Legenda interrompida" : "Legenda completa",
          cards: [
            { title: "Primeiro", body: "Texto fictício" },
            { title: "Segundo", body: "Outro texto fictício" },
          ],
        }),
        model: input.model,
        finishReason: socialCalls < 3 ? "length" : "stop",
        usage: {},
      };
    }
    return { content: "Revisão fictícia", model: input.model, usage: {} };
  };

  await assert.rejects(run(w, p.id), /limite máximo/);
  assert.equal(current(p), undefined);
  await run(w, p.id, { resume: true });
  assert.equal(socialCalls, 3);
  assert.equal(current(p).caption, "Legenda completa");
});

test("rewrite retries a truncated proposal and keeps it separate from the revision", async (t) => {
  const { w, p } = await fixture(t);
  w.revise(p.id, {
    article: "# Texto original",
    caption: "",
    cards: [],
  });
  const baseRevisionId = current(p).id;
  const limits = [];
  providers.complete = async (input) => {
    limits.push(input.maxTokens);
    return {
      content: limits.length === 1 ? "# Parcial" : "# Sugestão completa",
      model: input.model,
      finishReason: limits.length === 1 ? "length" : "stop",
      usage: { total_tokens: 15 },
    };
  };

  const suggestion = await rewrite(w, {
    id: p.id,
    target: "article",
    baseRevisionId,
    text: "# Texto original",
  });

  assert.deepEqual(limits, [6000, 9000]);
  assert.equal(suggestion.value, "# Sugestão completa");
  assert.equal(current(p).id, baseRevisionId);
  assert.equal(p.runs.at(-1).usage.total_tokens, 30);
  assert.equal(p.messages.filter((item) => item.partial).length, 1);
});

test("cancellation after the final saved stage leaves the finished review accessible", async (t) => {
  const { w, p } = await fixture(t);
  const controller = new AbortController();
  providers.complete = async (input) => ({
    content: input.system.includes("Escolha uma das ferramentas")
      ? '{"provider":"pubmed","query":"fixture"}'
      : input.model === "writer"
        ? "# Artigo fictício"
        : "Evidência e revisão fictícias",
    model: input.model,
    usage: {},
  });

  await run(w, p.id, {
    signal: controller.signal,
    notify: () => {
      if (p.sessions.at(-1)?.cursor === "done") controller.abort();
    },
  });

  assert.equal(controller.signal.aborted, true);
  assert.equal(p.sessions[0].status, "completed");
  assert.equal(p.status, "review");
  assert.equal(current(p).article, "# Artigo fictício");
});
