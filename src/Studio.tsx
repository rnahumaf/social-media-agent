import React, { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FolderOpen,
  Plus,
  Settings,
  FileText,
  Images,
  Search,
  MessageSquare,
  CheckCheck,
  Archive,
  X,
  PanelLeft,
  Play,
  Save,
  Send,
} from "lucide-react";
import type {
  State,
  Project,
  Revision,
  Channel,
  ResearchProvider,
  Knowledge,
  RewriteRequest,
  RewriteProposal,
  Card,
} from "./types";
import { preview } from "./preview";
import { channelsOf, defaultStyle, knowledgeOf } from "./editorial";
import { SettingsPanel, RunActivity } from "./panels";
import BlogEditor, { BlogPreview } from "./BlogEditor";
import CardEditor, { CardPreviews } from "./CardEditor";
import PublishDestinations from "./PublishDestinations";
import RevisionSources from "./RevisionSources";
const api = window.studio || preview;
const labels: Record<string, string> = {
  briefing: "Rascunho",
  review: "Em revisão",
  running: "Em execução",
  completed: "Concluído",
  paused: "Pausado",
  cancelled: "Cancelado",
  interrupted: "Interrompido",
  published: "Publicado",
  uncertain: "Resultado incerto",
  sending: "Enviando",
  reconciled: "Reconciliado",
};
const emptyRevision = (s: State | null): Revision => ({
  id: "draft",
  createdAt: new Date().toISOString(),
  article: "",
  caption: "",
  cards: [],
  origin: "manual",
  demo: false,
  style: s?.settings.cardStyle || defaultStyle,
});

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const list = focusable();
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0]?.focus();
        }
      }
    };
    const el = ref.current;
    el?.addEventListener("keydown", key);
    return () => {
      el?.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="split">
          <h2>{title}</h2>
          <button aria-label="Fechar diálogo" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function ResearchChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: ResearchProvider[];
  onChange: (v: ResearchProvider[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="choice-row">
      {(
        [
          ["pubmed", "PubMed"],
          ["web", "Web aberta"],
        ] as const
      ).map(([key, label]) => (
        <label className="check" key={key}>
          <input
            type="checkbox"
            checked={value.includes(key)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, key]
                  : value.filter((v) => v !== key),
              )
            }
          />
          {label}
        </label>
      ))}
    </div>
  );
}
function KnowledgePanel({
  state,
  busy,
  act,
  onDirty,
}: {
  state: State;
  busy: boolean;
  act: (n: string, p?: any) => Promise<any>;
  onDirty: (v: boolean) => void;
}) {
  const [value, setValue] = useState<Knowledge>(knowledgeOf(state));
  const [saved, setSaved] = useState(false);
  return (
    <section className="knowledge-panel">
      <h1>Conhecimento do autor</h1>
      <p className="muted">
        Estas preferências acompanham as pautas deste workspace. O briefing
        define os ajustes de cada conteúdo.
      </p>
      {(
        [
          [
            "general",
            "Preferências gerais",
            "Público, tom de voz, palavras a evitar e como apresentar argumentos.",
          ],
          [
            "blog",
            "Escrita para blog",
            "Estrutura, profundidade e uso de títulos e referências.",
          ],
          [
            "instagram",
            "Escrita para Instagram",
            "Ritmo dos cards, legendas e chamadas para ação.",
          ],
          [
            "examples",
            "Exemplos de escrita",
            "Cole trechos que representem sua voz e explique o que deseja preservar.",
          ],
        ] as const
      ).map(([key, label, placeholder]) => (
        <label key={key}>
          {label}
          <textarea
            value={value[key]}
            disabled={busy}
            placeholder={placeholder}
            maxLength={
              key === "general" ? 100000 : key === "examples" ? 40000 : 30000
            }
            onChange={(e) => {
              setValue({ ...value, [key]: e.target.value });
              setSaved(false);
              onDirty(true);
            }}
          />
        </label>
      ))}
      <div className="actions">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            if (await act("knowledge", { knowledge: value })) {
              onDirty(false);
              setSaved(true);
            }
          }}
        >
          Salvar conhecimento
        </button>
        {saved && <span role="status">Conhecimento salvo.</span>}
      </div>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<State | null>(null),
    [id, setId] = useState(""),
    [screen, setScreen] = useState("studio"),
    [tab, setTab] = useState("blog"),
    [working, setWorking] = useState(""),
    [notice, setNotice] = useState(""),
    [nav, setNav] = useState(false),
    [creating, setCreating] = useState(false),
    [projectForm, setProjectForm] = useState(false),
    [draft, setDraft] = useState<Revision | null>(null),
    [dirty, setDirty] = useState(false),
    [panelDirty, setPanelDirty] = useState(false),
    [settingsDirty, setSettingsDirty] = useState(false),
    [renderedRevision, setRenderedRevision] = useState(""),
    [version, setVersion] = useState(""),
    [message, setMessage] = useState(""),
    [steer, setSteer] = useState(""),
    [scope, setScope] = useState("all");
  const [rewriteTarget, setRewriteTarget] = useState<{
      target: RewriteRequest["target"];
      index?: number;
    } | null>(null),
    [rewriteInstruction, setRewriteInstruction] = useState(
      "Melhore a clareza e adapte ao canal, preservando o significado.",
    ),
    [proposal, setProposal] = useState<
      | (RewriteProposal & {
          original: string;
          projectId: string;
          index?: number;
        })
      | null
    >(null);
  const activeAction = useRef<symbol | null>(null);
  const chatRequest = useRef<{
    id: string;
    projectId: string;
    message: string;
  } | null>(null);
  const p = state?.projects.find((p) => p.id === id),
    r = p?.revisions.at(-1),
    session = p?.sessions?.at(-1),
    busy = !!working || !!state?.operation;
  const selected = p ? channelsOf(p) : [];
  const displayed = version
    ? p?.revisions.find((v) => v.id === version)
    : draft;
  const readOnly = !!version || (busy && working !== "rewrite");
  useEffect(() => {
    api
      .state()
      .then((s: State | null) => {
        setState(s);
        setId(s?.projects[0]?.id || "");
      })
      .catch((e: Error) => setNotice(e.message));
  }, []);
  useEffect(() => {
    setDraft(p ? structuredClone(r || emptyRevision(state)) : null);
    setDirty(false);
    setVersion("");
    setProposal(null);
    setScope("all");
  }, [id, r?.id]);
  useEffect(() => {
    if (p && tab === "blog" && !selected.includes("blog")) setTab("instagram");
    if (p && tab === "instagram" && !selected.includes("instagram"))
      setTab("blog");
  }, [id, JSON.stringify(selected), tab]);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    const refresh = () => {
      const owner = activeAction.current;
      return api
        .state()
        .then((value: State | null) => {
          if (active && activeAction.current === owner) setState(value);
        })
        .catch(() => {});
    };
    void refresh();
    const timer = setInterval(refresh, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [busy]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || panelDirty || settingsDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, panelDirty, settingsDirty]);
  async function act(name: string, payload?: any) {
    if (name === "cancel") {
      const operation = state?.operation;
      if (!operation?.cancellable || operation.cancelRequested) return null;
      try {
        const owner = activeAction.current;
        await api.cancel({ operationId: operation.id });
        const refreshed = await api.state();
        if (activeAction.current === owner || !activeAction.current)
          setState(refreshed);
        return true;
      } catch (error) {
        setNotice((error as Error).message);
        return null;
      }
    }
    if (activeAction.current) return null;
    const actionId = Symbol(name);
    activeAction.current = actionId;
    setWorking(name);
    setNotice("");
    try {
      const result = await api[name](payload);
      if (result?.format) {
        setState(result);
        if (name === "open") {
          setId(result.projects[0]?.id || "");
          setScreen("studio");
        }
      } else {
        // Proposals and boolean results do not carry a final workspace snapshot.
        // Refresh before resolving so the editor never retains a completed operation.
        setState(await api.state());
        if (result === true) setNotice("Operação concluída.");
      }
      if (name.endsWith("Test")) setNotice("Conexão verificada com sucesso.");
      return result;
    } catch (e) {
      setNotice(
        (e as Error).message.replace(
          /^Error invoking remote method '[^']+': Error: /,
          "",
        ),
      );
      await api
        .state()
        .then(setState)
        .catch(() => {});
      return null;
    } finally {
      if (activeAction.current === actionId) {
        activeAction.current = null;
        setWorking("");
      }
    }
  }
  function leave(action: () => void) {
    if (
      (dirty || panelDirty || settingsDirty) &&
      !confirm("Descartar as alterações ainda não salvas?")
    )
      return;
    setPanelDirty(false);
    setSettingsDirty(false);
    setDirty(false);
    setDraft(p ? structuredClone(r || emptyRevision(state)) : null);
    setProposal(null);
    action();
    setNav(false);
  }
  function change(next: Revision) {
    setDraft(next);
    setDirty(true);
  }
  async function save() {
    if (!draft || !p) return null;
    return act("edit", {
      id: p.id,
      content: draft,
      ...(r ? { baseRevisionId: r.id } : {}),
    });
  }
  async function generate(resume = false) {
    if (!p) return;
    if (dirty) {
      setNotice("Salve suas alterações antes de gerar.");
      return;
    }
    if (window.studio && (!state?.unlocked || !state.openrouterConfigured)) {
      setNotice(
        "Configure a chave OpenRouter em Modelos e conexões para usar a IA. A escrita manual continua disponível.",
      );
      return;
    }
    await act("run", {
      id: p.id,
      resume,
      instruction: resume ? steer : "",
      targets: scope === "all" ? selected : [scope],
    });
  }
  const originalText = (target: RewriteRequest["target"], index?: number) =>
    target === "card"
      ? JSON.stringify({
          title: draft?.cards[index!]?.title,
          body: draft?.cards[index!]?.body,
        })
      : draft?.[target] || "";
  async function requestRewrite() {
    if (!rewriteTarget || !draft || !p) return;
    const original = originalText(rewriteTarget.target, rewriteTarget.index);
    let base = r;
    if (!base || dirty) {
      const saved = await save();
      if (!saved) return;
      base = saved.projects.find((q: Project) => q.id === id)?.revisions.at(-1);
    }
    if (!base) return;
    const target = { ...rewriteTarget };
    setRewriteTarget(null);
    const response = await act("rewrite", {
      id,
      baseRevisionId: base.id,
      target: target.target,
      text: target.target === "card" ? undefined : original,
      card: target.target === "card" ? draft.cards[target.index!] : undefined,
      instruction: rewriteInstruction,
    } satisfies RewriteRequest);
    if (response)
      setProposal({
        ...response,
        original,
        projectId: id,
        index: target.index,
      });
  }
  const canApply =
    !!proposal &&
    proposal.projectId === id &&
    proposal.baseRevisionId === r?.id &&
    originalText(proposal.target, proposal.index) === proposal.original;
  function applyProposal() {
    if (!proposal || !draft || !canApply) return;
    if (proposal.target === "card")
      change({
        ...draft,
        cards: draft.cards.map((c, i) =>
          i === proposal.index ? { ...c, ...(proposal.value as Card) } : c,
        ),
      });
    else change({ ...draft, [proposal.target]: proposal.value });
    setProposal(null);
  }
  const operation = state?.operation;
  const operationNames: Record<string, string> = {
    run: "Gerando conteúdo",
    chat: "Respondendo à conversa",
    rewrite: "Preparando reescrita",
    publish: "Enviando publicação",
    reconcile: "Verificando publicação",
    instagramConnect: "Conectando Instagram",
    wordpressConnect: "Conectando WordPress",
    bloggerConnect: "Conectando Blogger",
  };
  return (
    <div className="app desktop-studio">
      <aside className={"sidebar " + (nav ? "shown" : "")}>
        <div className="brand">
          <BookOpen size={22} />
          <span>
            Social Media Agent<small>ESTÚDIO EDITORIAL</small>
          </span>
        </div>
        <button
          className="workspace"
          disabled={busy}
          onClick={() => leave(() => void act("open"))}
        >
          <FolderOpen size={18} />
          <span>
            {state?.name || "Abrir workspace"}
            <small>Pasta local e portável</small>
          </span>
        </button>
        <div className="section-label">
          PAUTAS
          <button
            aria-label="Nova pauta"
            disabled={!state || busy}
            onClick={() => setCreating(true)}
          >
            <Plus size={18} />
          </button>
        </div>
        <nav className="projects" aria-label="Pautas">
          {state?.projects.map((project) => (
            <button
              key={project.id}
              className={
                id === project.id && screen === "studio" ? "selected" : ""
              }
              onClick={() =>
                leave(() => {
                  setId(project.id);
                  setScreen("studio");
                })
              }
            >
              <FileText size={17} />
              <span>
                {project.title}
                <small>{labels[project.status] || project.status}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <button
            className={screen === "knowledge" ? "selected" : ""}
            disabled={!state}
            onClick={() => leave(() => setScreen("knowledge"))}
          >
            <BookOpen size={18} />
            Conhecimento
          </button>
          <button
            disabled={!state}
            onClick={() => leave(() => setScreen("settings"))}
          >
            <Settings size={18} />
            Modelos e conexões
          </button>
          <button disabled={!state || busy} onClick={() => act("backup")}>
            <Archive size={18} />
            Copiar workspace
          </button>
          <p className="small muted">
            Beta · Revisão humana antes de publicar.
          </p>
        </div>
      </aside>
      <main className="main">
        <header>
          <div className="breadcrumb">
            <button
              className="menu"
              aria-label="Abrir navegação"
              onClick={() => setNav(!nav)}
            >
              <PanelLeft size={20} />
            </button>
            <strong>
              {screen === "knowledge"
                ? "Conhecimento"
                : screen === "settings"
                  ? "Configurações"
                  : "Produção editorial"}
            </strong>
          </div>
          <span className="mode">
            {!window.studio
              ? "Prévia de desenvolvimento"
              : state?.openrouterConfigured
                ? "IA conectada"
                : "Escrita manual disponível"}
          </span>
        </header>
        {busy && (
          <div
            className="notice operation-status"
            role="status"
            aria-live="polite"
          >
            <span>
              {operation?.cancelRequested
                ? "Cancelando operação…"
                : operationNames[operation?.name || working] ||
                  "Operação em andamento…"}
              {operation?.projectId &&
                ` · ${state?.projects.find((project) => project.id === operation.projectId)?.title || "Pauta"}`}
            </span>
            {operation?.cancellable && (
              <button
                data-testid="cancel-operation"
                disabled={operation.cancelRequested}
                onClick={() => act("cancel")}
              >
                Cancelar
              </button>
            )}
          </div>
        )}
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {screen === "settings" && state ? (
          <>
            <section className="research-settings">
              <h2>Ferramentas de pesquisa</h2>
              <p>
                O pesquisador escolhe entre as buscas permitidas conforme a
                pauta. Web aberta usa os créditos da sua conta OpenRouter.
              </p>
              <ResearchSettings
                state={state}
                busy={busy}
                act={act}
                onDirty={setPanelDirty}
              />
            </section>
            <SettingsPanel
              state={state}
              busy={busy}
              act={act}
              onDirty={setSettingsDirty}
            />
          </>
        ) : screen === "knowledge" && state ? (
          <KnowledgePanel
            key={state.name}
            state={state}
            busy={busy}
            act={act}
            onDirty={setPanelDirty}
          />
        ) : !p ? (
          <section className="welcome">
            <h1>Crie conteúdo com a sua voz.</h1>
            <p>
              Escreva para blog e Instagram, use seus próprios textos e imagens
              ou peça ajuda à IA.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() => (state ? setCreating(true) : act("open"))}
            >
              {state ? "Criar primeira pauta" : "Escolher pasta de trabalho"}
            </button>
          </section>
        ) : (
          <>
            <section className="project-header">
              <div>
                <div className="eyebrow">
                  {labels[p.status] || p.status} ·{" "}
                  {selected
                    .map((v) => (v === "blog" ? "Blog" : "Instagram"))
                    .join(" e ")}
                </div>
                <h1>{p.title}</h1>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setProjectForm(true)}
                >
                  Briefing, canais e pesquisa
                </button>
              </div>
              <div className="actions">
                {!busy && (
                  <>
                    <select
                      aria-label="Canal a gerar"
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="all">
                        {selected.length === 2
                          ? "Blog e Instagram"
                          : selected[0] === "blog"
                            ? "Blog"
                            : "Instagram"}
                      </option>
                      {selected.length === 2 && (
                        <>
                          <option value="blog">Somente blog</option>
                          <option value="instagram">Somente Instagram</option>
                        </>
                      )}
                    </select>
                    <button
                      disabled={busy || dirty}
                      onClick={() => generate(false)}
                    >
                      <Play size={16} />
                      {r ? "Gerar com IA" : "Criar com IA"}
                    </button>
                  </>
                )}
              </div>
            </section>
            {session && (
              <RunActivity
                session={session}
                busy={busy}
                steer={steer}
                setSteer={setSteer}
                resume={() => generate(true)}
              />
            )}
            <div className="production">
              <section className="editor-panel">
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Materiais da pauta"
                >
                  {(
                    [
                      ["blog", "Blog", FileText],
                      ["instagram", "Instagram", Images],
                      ["sources", "Fontes", Search],
                      ["chat", "Conversa", MessageSquare],
                      ["review", "Revisar e publicar", CheckCheck],
                    ] as const
                  )
                    .filter(
                      ([key]) =>
                        !["blog", "instagram"].includes(key) ||
                        selected.includes(key as Channel),
                    )
                    .map(([key, label, Icon]) => (
                      <button
                        role="tab"
                        aria-selected={tab === key}
                        className={tab === key ? "active" : ""}
                        key={key}
                        onClick={() => setTab(key)}
                      >
                        <Icon size={16} />
                        {label}
                      </button>
                    ))}
                </div>
                {["blog", "instagram", "sources"].includes(tab) && (
                  <div className="editor-tools">
                    <span role="status">
                      {dirty
                        ? "Alterações não salvas"
                        : r
                          ? "Revisão salva"
                          : "Rascunho · comece a escrever"}
                    </span>
                    <div className="actions">
                      <button
                        className="text-button"
                        onClick={() => leave(() => setScreen("knowledge"))}
                      >
                        Preferências do autor
                      </button>
                      {r && (
                        <select
                          aria-label="Revisão exibida"
                          value={version}
                          onChange={(e) => {
                            if (
                              dirty &&
                              !confirm(
                                "Descartar as alterações ainda não salvas?",
                              )
                            )
                              return;
                            setDraft(structuredClone(r));
                            setDirty(false);
                            setVersion(e.target.value);
                          }}
                        >
                          <option value="">Revisão atual</option>
                          {p.revisions.slice(0, -1).map((v, i) => (
                            <option value={v.id} key={v.id}>
                              Revisão {i + 1}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="primary"
                        disabled={busy || !dirty || !!version}
                        onClick={save}
                      >
                        <Save size={16} />
                        Salvar revisão
                      </button>
                    </div>
                  </div>
                )}
                {tab === "blog" && displayed && (
                  <>
                    <BlogEditor
                      key={id + version}
                      value={displayed.article}
                      readOnly={readOnly}
                      onChange={(article) => change({ ...draft!, article })}
                    />
                    <div className="content-actions">
                      <button
                        disabled={readOnly || busy || !displayed.article.trim()}
                        onClick={() => setRewriteTarget({ target: "article" })}
                      >
                        Reescrever artigo com IA
                      </button>
                      {session?.artifacts?.article && !session.revisionId && (
                        <details>
                          <summary>
                            Texto parcial da geração interrompida
                          </summary>
                          <BlogPreview value={session.artifacts.article} />
                          <button
                            disabled={readOnly}
                            onClick={() =>
                              change({
                                ...draft!,
                                article: session.artifacts!.article!,
                              })
                            }
                          >
                            Usar este rascunho
                          </button>
                        </details>
                      )}
                    </div>
                  </>
                )}
                {tab === "instagram" && displayed && state && (
                  <CardEditor
                    revision={displayed}
                    onChange={change}
                    api={api}
                    act={act}
                    busy={busy}
                    readOnly={readOnly}
                    state={state}
                    rewrite={(target, index) =>
                      setRewriteTarget({ target, index })
                    }
                  />
                )}
                {tab === "sources" && (
                  <RevisionSources
                    project={p}
                    revision={
                      version
                        ? p.revisions.find((item) => item.id === version)
                        : r
                    }
                  />
                )}
                {tab === "chat" && (
                  <div className="chat">
                    <div className="messages">
                      {p.messages
                        .filter((m) => !m.internal)
                        .map((m, i) => (
                          <article
                            key={i}
                            className={m.role === "user" ? "user-message" : ""}
                          >
                            <strong>
                              {m.role === "user"
                                ? "Você"
                                : m.agent || "Assistente"}
                            </strong>
                            <pre className="prose">{m.content}</pre>
                            {["cancelled", "failed"].includes(
                              m.status || "",
                            ) && (
                              <small>
                                {m.status === "cancelled"
                                  ? "Resposta cancelada"
                                  : "Resposta não concluída"}{" "}
                                · Sua mensagem foi preservada.
                              </small>
                            )}
                          </article>
                        ))}
                      {!p.messages.length && (
                        <p className="muted">
                          Converse sobre a pauta ou registre orientações para os
                          agentes.
                        </p>
                      )}
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (
                          !chatRequest.current ||
                          chatRequest.current.projectId !== id ||
                          chatRequest.current.message !== message
                        )
                          chatRequest.current = {
                            id: crypto.randomUUID(),
                            projectId: id,
                            message,
                          };
                        if (
                          await act("chat", {
                            id,
                            message,
                            requestId: chatRequest.current.id,
                          })
                        ) {
                          setMessage("");
                          chatRequest.current = null;
                        }
                      }}
                    >
                      <textarea
                        aria-label="Mensagem"
                        maxLength={10000}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                      />
                      <button
                        className="primary"
                        aria-label="Enviar mensagem"
                        disabled={busy || !message.trim()}
                      >
                        <Send size={18} />
                      </button>
                    </form>
                  </div>
                )}
                {tab === "review" && (
                  <div className="content-pad review-content">
                    <h2>Revisar e publicar</h2>
                    <p className="small muted">
                      Prévia da revisão atual salva
                      {r ? ` (${p.revisions.length})` : ""}.
                    </p>
                    {dirty && (
                      <p role="alert" className="inline-note">
                        Salve as alterações antes de aprovar. Abaixo está a
                        última revisão salva.
                      </p>
                    )}
                    {r?.demo && (
                      <p className="inline-note">
                        Esta revisão contém material de demonstração e não pode
                        ser publicada.
                      </p>
                    )}
                    {r ? (
                      <>
                        {selected.includes("blog") && (
                          <section>
                            <h3>Blog · artigo final</h3>
                            <BlogPreview value={r.article} />
                          </section>
                        )}
                        {selected.includes("instagram") && (
                          <section>
                            <h3>Instagram · cards e legenda</h3>
                            <CardPreviews
                              revision={r}
                              api={api}
                              onRendered={setRenderedRevision}
                            />
                            <p className="caption-preview">{r.caption}</p>
                          </section>
                        )}
                        <details
                          className="review-feedback"
                          data-review-status={
                            p.reviewFeedback?.status || "none"
                          }
                        >
                          <summary>
                            {p.reviewFeedback?.status === "current"
                              ? "Revisão com IA desta versão"
                              : p.reviewFeedback?.status === "stale"
                                ? "Revisão anterior com IA — desatualizada"
                                : p.reviewFeedback?.status === "legacy"
                                  ? "Revisão antiga — versão não identificada"
                                  : "Esta versão ainda não foi revisada pela IA"}
                          </summary>
                          <p className="small muted">
                            {p.reviewFeedback?.status === "current"
                              ? "Avaliação vinculada a esta revisão. Canais conferidos: " +
                                p.reviewFeedback.channels?.join(" e ") +
                                "."
                              : "As observações antigas não validam o conteúdo atual. A revisão e a aprovação manual continuam disponíveis."}
                          </p>
                          {p.reviewFeedback?.content && (
                            <pre className="prose">
                              {p.reviewFeedback.content}
                            </pre>
                          )}
                        </details>
                      </>
                    ) : (
                      <p>
                        Escreva e salve uma revisão para conferir os materiais.
                      </p>
                    )}
                    {state && (
                      <PublishDestinations
                        project={p}
                        state={state}
                        busy={busy}
                        dirty={dirty}
                        renderedRevision={renderedRevision}
                        act={act}
                        openSettings={() => leave(() => setScreen("settings"))}
                      />
                    )}
                    {selected.includes("blog") &&
                      !state?.settings.bloggerId &&
                      !state?.settings.wordpressUrl && (
                        <p>
                          Conecte o Blogger ou WordPress em{" "}
                          <button
                            className="text-button"
                            onClick={() => leave(() => setScreen("settings"))}
                          >
                            Modelos e conexões
                          </button>{" "}
                          para publicar o blog.
                        </p>
                      )}
                    <p className="small muted">
                      A aprovação vale para a revisão e o destino indicados.
                      Editar exige uma nova aprovação.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
      {creating && state && (
        <ProjectDialog
          state={state}
          busy={busy}
          onClose={() => setCreating(false)}
          onSubmit={async (fields) => {
            if (
              (dirty || panelDirty || settingsDirty) &&
              !confirm("Descartar as alterações ainda não salvas?")
            )
              return;
            const result = await act("create", fields);
            if (result) {
              setId(result.projects[0].id);
              setScreen("studio");
              setTab(fields.channels.includes("blog") ? "blog" : "instagram");
              setCreating(false);
              setPanelDirty(false);
              setSettingsDirty(false);
              if (!fields.manual) {
                if (
                  window.studio &&
                  (!result.unlocked || !result.openrouterConfigured)
                ) {
                  setNotice(
                    "Pauta criada. Configure a chave OpenRouter em Modelos e conexões para gerar com IA, ou comece a escrever no editor.",
                  );
                } else {
                  await act("run", {
                    id: result.projects[0].id,
                    targets: fields.channels,
                  });
                }
              }
            }
          }}
        />
      )}
      {projectForm && p && state && (
        <ProjectDialog
          project={p}
          state={state}
          busy={busy}
          onClose={() => setProjectForm(false)}
          onSubmit={async (fields) => {
            if (await act("update", { id, ...fields })) setProjectForm(false);
          }}
        />
      )}
      {rewriteTarget && (
        <Modal title="Reescrever com IA" onClose={() => setRewriteTarget(null)}>
          <label>
            Orientação
            <textarea
              aria-label="Orientação para reescrita"
              value={rewriteInstruction}
              onChange={(e) => setRewriteInstruction(e.target.value)}
              maxLength={10000}
            />
          </label>
          <p>
            O texto será salvo antes da solicitação. Você poderá comparar e
            escolher se aplica a sugestão.
          </p>
          <button className="primary" disabled={busy} onClick={requestRewrite}>
            Solicitar sugestão
          </button>
        </Modal>
      )}
      {proposal && (
        <Modal title="Sugestão de reescrita" onClose={() => setProposal(null)}>
          <div className="suggestion-comparison">
            <section>
              <h3>Original</h3>
              <pre>
                {proposal.target === "card"
                  ? Object.values(JSON.parse(proposal.original)).join("\n\n")
                  : proposal.original}
              </pre>
            </section>
            <section>
              <h3>Sugestão</h3>
              <pre>
                {typeof proposal.value === "string"
                  ? proposal.value
                  : `${proposal.value.title}\n\n${proposal.value.body}`}
              </pre>
            </section>
          </div>
          {!canApply && (
            <p role="alert">
              O texto ou a revisão mudou. Solicite uma nova sugestão para
              preservar suas edições.
            </p>
          )}
          <div className="actions">
            <button onClick={() => setProposal(null)}>
              Descartar sugestão
            </button>
            <button
              className="primary"
              disabled={!canApply || busy}
              onClick={applyProposal}
            >
              Aplicar sugestão
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ResearchSettings({
  state,
  busy,
  act,
  onDirty,
}: {
  state: State;
  busy: boolean;
  act: (n: string, p?: any) => Promise<any>;
  onDirty: (v: boolean) => void;
}) {
  const [value, setValue] = useState<ResearchProvider[]>(
    state.settings.research || ["pubmed"],
  );
  return (
    <>
      <ResearchChoices
        value={value}
        disabled={busy}
        onChange={(v) => {
          setValue(v);
          onDirty(true);
        }}
      />
      <button
        disabled={busy || !value.length}
        onClick={async () => {
          if (
            await act("settings", {
              settings: { ...state.settings, research: value },
            })
          )
            onDirty(false);
        }}
      >
        Salvar ferramentas de pesquisa
      </button>
    </>
  );
}
function ProjectDialog({
  project,
  state,
  busy,
  onClose,
  onSubmit,
}: {
  project?: Project;
  state: State;
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: {
    title: string;
    brief: string;
    channels: Channel[];
    research: ResearchProvider[] | null;
    manual: boolean;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(project?.title || ""),
    [brief, setBrief] = useState(project?.brief || ""),
    [channels, setChannels] = useState<Channel[]>(
      project ? (channelsOf(project) as Channel[]) : [],
    ),
    [manual, setManual] = useState(false),
    [override, setOverride] = useState(!!project?.research),
    [research, setResearch] = useState<ResearchProvider[]>(
      project?.research || state.settings.research || ["pubmed"],
    );
  return (
    <Modal
      title={project ? "Briefing, canais e pesquisa" : "Nova pauta"}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            title,
            brief,
            channels,
            research: override ? research : null,
            manual,
          });
        }}
      >
        <label>
          Tema
          <input
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="O que você quer publicar?"
          />
        </label>
        <label>
          Briefing
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={200000}
            placeholder="Público, objetivo e orientações para esta pauta"
          />
        </label>
        <fieldset>
          <legend>Canais desta pauta</legend>
          <div className="choice-row">
            {(
              [
                ["blog", "Blog"],
                ["instagram", "Instagram"],
              ] as const
            ).map(([key, label]) => (
              <label className="check" key={key}>
                <input
                  type="checkbox"
                  checked={channels.includes(key)}
                  onChange={(e) =>
                    setChannels(
                      e.target.checked
                        ? [...channels, key]
                        : channels.filter((v) => v !== key),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {!project && (
          <fieldset>
            <legend>Como começar</legend>
            <label className="check">
              <input
                type="radio"
                name="creation"
                checked={!manual}
                onChange={() => setManual(false)}
              />
              Criar com IA
            </label>
            <label className="check">
              <input
                type="radio"
                name="creation"
                checked={manual}
                onChange={() => setManual(true)}
              />
              Escrever manualmente
            </label>
          </fieldset>
        )}
        <details>
          <summary>Ferramentas de pesquisa</summary>
          <label className="check">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Definir buscas para esta pauta
          </label>
          <ResearchChoices
            value={research}
            disabled={!override}
            onChange={setResearch}
          />
          <p className="small muted">
            O agente escolhe entre as ferramentas permitidas. A escrita manual e
            a reescrita não exigem pesquisa.
          </p>
        </details>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !title.trim() ||
              !channels.length ||
              (override && !research.length)
            }
          >
            {project
              ? "Salvar pauta"
              : manual
                ? "Começar a escrever"
                : "Criar pauta"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
