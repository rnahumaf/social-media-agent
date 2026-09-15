const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Workspace } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const providers = require("../core/providers.cjs");

const scenarios = [
  {
    title: "Otite aguda e crônica em cães",
    brief: "Explique diferenças e ressalvas para tutores.",
    social: () => ({
      caption: "Informação veterinária com contexto.",
      cards: [
        { title: "Duas apresentações", body: "O tempo de evolução importa." },
        {
          title: "Avaliação individual",
          body: "Procure orientação veterinária.",
        },
      ],
    }),
  },
  {
    title: "Achados laboratoriais incidentais",
    brief: "Discuta rastreamento sem indicação clínica.",
    social: () => ({
      caption: "Exames precisam responder a uma pergunta.",
      cards: [
        { title: "Contexto", body: "A".repeat(500) },
        { title: "Decisão", body: "B".repeat(500) },
      ],
    }),
    repair: true,
  },
  {
    title: "Saúde bucal de gatos idosos",
    brief: "Material curto para responsáveis por animais.",
    social: () => ({
      caption: "Cuidados graduais e avaliação profissional.",
      cards: [
        {
          title: "Observe mudanças",
          body: "Atenção ao comportamento alimentar.",
        },
        {
          title: "Evite conclusões isoladas",
          body: "Sinais exigem contexto clínico.",
        },
      ],
    }),
    fenced: true,
  },
  {
    title: "Vacinação e comunicação de risco",
    brief: "Explique benefícios e limites sem alarmismo.",
    social: () => ({
      caption: "Converse com uma equipe de saúde.",
      cards: Array.from({ length: 8 }, (_, index) => ({
        title: `Ponto ${index + 1}`,
        body: `Mensagem ${index + 1} com linguagem clara e ressalvas.`,
      })),
    }),
  },
  {
    title: "Uso responsável de antibióticos",
    brief: "Evite prescrição e destaque avaliação profissional.",
    malformed: true,
    repair: true,
  },
  {
    title: "Atividade física após internação",
    brief: "Oriente retomada gradual sem dar conduta individual.",
    social: () => ({
      caption: "Retomada individual e acompanhada.",
      cards: [
        { title: "T".repeat(100), body: "Movimento gradual ".repeat(30) },
        {
          title: "Reavalie",
          body: "Adapte o plano aos sinais e à orientação recebida.",
        },
      ],
    }),
    repairUnavailable: true,
  },
];

test("editorial pipeline completes a matrix of valid, malformed and oversized social outputs", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-matrix-"));
  const workspace = await Workspace.open(root, {testMode:true});
  workspace.state.settings.demo = false;
  workspace.state.settings.models = {
    researcher: "fixture/research",
    writer: "fixture/writer",
    social: "fixture/social",
    reviewer: "fixture/reviewer",
  };
  workspace.secrets = { openrouter: "fixture-key" };
  const original = { ...providers };
  t.after(() => {
    Object.assign(providers, original);
    workspace.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  providers.pubmed = async () => [
    {
      pmid: "12345678",
      title: "Fonte de cenário",
      abstract: "Resumo de cenário.",
      access: "abstract",
      url: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
    },
  ];
  providers.complete = async (input) => {
    if (input.system.includes("Retorne somente JSON"))
      return {
        content: '{"query":"clinical communication"}',
        model: input.model,
        usage: {},
      };
    if (input.system.includes("Corrija a saída")) {
      const payload = JSON.parse(input.messages[0].content);
      const scenario = scenarios.find((item) =>
        payload.article.includes(item.title),
      );
      if (scenario?.repairUnavailable) throw Error("Correção indisponível");
      return {
        content: JSON.stringify({
          caption: "Versão corrigida e concisa.",
          cards: [
            {
              title: "Ideia central",
              body: "Texto condensado com a ressalva preservada.",
            },
            {
              title: "Próximo passo",
              body: "Procure avaliação adequada ao contexto.",
            },
          ],
        }),
        model: input.model,
        usage: {},
      };
    }
    const context = JSON.parse(input.messages[0].content);
    if (input.model === "fixture/research")
      return {
        content: "Dossiê [PMID: 12345678]",
        model: input.model,
        usage: {},
      };
    if (input.model === "fixture/writer") {
      assert.match(input.system, /Skill editorial ativa: rn-natural-writing/);
      assert.match(input.system, /Defina uma tese central/);
      assert.match(input.system, /Não use travessões como recurso estilístico/);
      assert.match(input.system, /Não acrescente avisos defensivos/);
      assert.match(input.system, /Preferências editoriais deste workspace:/);
      return {
        content: `# ${context.title}\n\nTexto fundamentado [PMID: 12345678].`,
        model: input.model,
        usage: {},
      };
    }
    if (input.model === "fixture/reviewer")
      return { content: "Revisão concluída.", model: input.model, usage: {} };
    const scenario = scenarios.find((item) => item.title === context.title);
    let content = scenario.malformed
      ? "legenda sem JSON"
      : JSON.stringify(scenario.social());
    if (scenario.fenced) content = `\`\`\`json\n${content}\n\`\`\``;
    return { content, model: input.model, usage: {} };
  };

  for (const scenario of scenarios) {
    const project = workspace.create(scenario.title, scenario.brief);
    await run(workspace, project.id);
    assert.equal(project.status, "review", scenario.title);
    assert.equal(project.sessions[0].status, "completed", scenario.title);
    assert.equal(project.revisions.length, 1, scenario.title);
    assert.ok(project.revisions[0].cards.length >= 2, scenario.title);
    assert.ok(project.revisions[0].cards.length <= 8, scenario.title);
    assert.ok(
      project.revisions[0].cards.every(
        (card) => card.title.length <= 90 && card.body.length <= 420,
      ),
      scenario.title,
    );
  }
});
