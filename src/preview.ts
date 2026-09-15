import type { API, State } from "./types";
import { defaultStyle } from "./editorial";
let state: State = JSON.parse(
  localStorage.getItem("studio-preview") || "null",
) || {
  format: 1,
  name: "Workspace de demonstração",
  memory: "Preserve incertezas e cite as fontes consultadas.",
  openrouterConfigured: false,
  settings: {
    demo: true,
    models: { researcher: "", writer: "", social: "", reviewer: "" },
    wordpressUrl: "",
    wordpressUser: "",
    instagramAccount: "",
    graphVersion: "v23.0",
  },
  projects: [],
};
const save = () => {
  localStorage.setItem("studio-preview", JSON.stringify(state));
  return structuredClone(state);
};
export const preview: API = {
  bloggerConnect: async () => {
    throw Error("Abra o aplicativo desktop para conectar o Blogger.");
  },
  bloggerSelect: async () => {
    throw Error("Abra o aplicativo desktop.");
  },
  bloggerTest: async () => {
    throw Error("Abra o aplicativo desktop.");
  },
  bloggerDisconnect: async () => {
    throw Error("Abra o aplicativo desktop.");
  },
  update: async ({ id, ...fields }) => {
    const p = state.projects.find((p) => p.id === id)!;
    Object.assign(p, fields);
    p.approval = null;
    return save();
  },
  state: async () => save(),
  open: async () => save(),
  create: async ({
    title,
    brief,
    query = "",
    channels = ["blog", "instagram"],
    research = null,
    manual = false,
    decisions,
  }) => {
    state.projects.unshift({
      decisions,
      id: crypto.randomUUID(),
      title,
      brief,
      channels,
      research,
      query,
      status: "briefing",
      sources: [],
      messages: [],
      runs: [],
      sessions: [],
      revisions: manual
        ? [
            {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              article: "",
              caption: "",
              cards: [],
              style: state.settings.cardStyle || defaultStyle,
              origin: "manual",
              demo: false,
            },
          ]
        : [],
      approval: null,
      publications: {},
    });
    return save();
  },
  settings: async ({ settings, memory }) => {
    state.settings = { ...state.settings, ...settings, demo: true };
    if (memory !== undefined) state.memory = memory;
    return save();
  },
  knowledge: async ({ knowledge }) => {
    state.knowledge = knowledge;
    state.memory = knowledge.general;
    return save();
  },
  run: async ({ id }) => {
    const p = state.projects.find((p) => p.id === id)!;
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    p.sessions ||= [];
    p.sessions.push({
      id: sessionId,
      status: "completed",
      cursor: "done",
      startedAt: timestamp,
      updatedAt: timestamp,
      finishedAt: timestamp,
      artifacts: {},
      events: [
        {
          id: crypto.randomUUID(),
          at: timestamp,
          kind: "status",
          title: "Execução iniciada",
        },
        {
          id: crypto.randomUUID(),
          at: timestamp,
          kind: "tool_result",
          role: "researcher",
          title: "Fonte de demonstração preparada",
          detail: "Nenhuma consulta externa foi executada.",
        },
        ...["researcher", "writer", "social", "reviewer"].map((role) => ({
          id: crypto.randomUUID(),
          at: timestamp,
          kind: "output" as const,
          role,
          title: `${
            {
              researcher: "Pesquisador",
              writer: "Redator",
              social: "Social media",
              reviewer: "Revisor",
            }[role]
          } concluiu a etapa`,
          detail: "Resultado salvo no workspace.",
        })),
      ],
    });
    p.sources = [
      {
        title: "Exemplo fictício — sem evidência científica",
        pmid: "DEMO",
        abstract:
          "O navegador demonstra a interface. A pesquisa real está no aplicativo desktop.",
        access: "demo",
        url: "",
      },
    ];
    p.runs = ["researcher", "writer", "social", "reviewer"].map((role) => ({
      id: crypto.randomUUID(),
      sessionId,
      role,
      model: "Demonstração local",
      status: "completed",
    }));
    p.revisions.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      article: `# ${p.title}\n\n> Demonstração editorial. Não contém evidências clínicas.\n\n## Uma pergunta bem formulada\n\nA produção começa com a definição do público, da pergunta e das fontes que precisam ser consultadas.\n\n## Das evidências à conversa\n\nO artigo mantém as referências e as limitações. Os cards apresentam uma ideia de cada vez.\n\n## Antes de publicar\n\nRevise os materiais e confirme a versão final.`,
      caption:
        "Uma boa conversa começa com fontes e contexto. Exemplo de demonstração. #Ciência #Comunicação",
      cards: [
        {
          title: p.title,
          body: "Uma pauta começa com uma boa pergunta. Exemplo editorial de demonstração.",
        },
        {
          title: "O contexto importa",
          body: "Preserve as limitações das fontes e explique o que elas permitem concluir.",
        },
        {
          title: "Uma revisão humana",
          body: "Confira o artigo e cada card antes de aprovar o material.",
        },
      ],
    });
    p.messages.push({
      role: "assistant",
      agent: "reviewer",
      content:
        "Material fictício. Não usar como conteúdo científico. No desktop, configure o OpenRouter para executar a pesquisa e a geração reais.",
      at: new Date().toISOString(),
    });
    p.approval = null;
    p.status = "review";
    return save();
  },
  draft: async ({ id, content, baseRevisionId }) => {
    const p = state.projects.find((p) => p.id === id)!;
    if ((p.revisions.at(-1)?.id || null) !== baseRevisionId)
      throw Error("A revisão mudou.");
    p.draft = { content, baseRevisionId, updatedAt: new Date().toISOString() };
    save();
    return structuredClone(p.draft);
  },
  edit: async ({ id, content }) => {
    const p = state.projects.find((p) => p.id === id)!;
    p.revisions.push({
      ...content,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    p.approval = null;
    delete p.draft;
    return save();
  },
  approve: async ({ id, channel }) => {
    const p = state.projects.find((p) => p.id === id)!;
    p.approval = { ...p.approval, [channel]: "preview" };
    return save();
  },
  chat: async ({ id, message }) => {
    const p = state.projects.find((p) => p.id === id)!;
    p.messages.push(
      { role: "user", content: message, at: new Date().toISOString() },
      {
        role: "assistant",
        content:
          "Orientação registrada nesta demonstração. Use o desktop para conversar com o modelo escolhido.",
        at: new Date().toISOString(),
      },
    );
    return save();
  },
  cancel: async () => true,
};
for (const name of [
  "wordpressConnect",
  "wordpressDisconnect",
  "wordpressTest",
  "instagramConnect",
  "instagramDisconnect",
  "instagramTest",
  "vault",
  "lock",
  "models",
  "backup",
  "export",
  "publish",
  "reconcile",
  "rewrite",
  "importImage",
])
  preview[name] = async () => {
    throw Error(
      "Este recurso está disponível no aplicativo desktop. O navegador oferece apenas uma demonstração local, sem credenciais.",
    );
  };
