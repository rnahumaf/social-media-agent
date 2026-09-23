import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  BookOpen,
  FolderOpen,
  Plus,
  Settings,
  FileText,
  Images,
  Archive,
  X,
  PanelLeft,
  Play,
  Send,
} from "lucide-react";
import type {
  State,
  Project,
  Revision,
  Channel,
  ResearchProvider,
  Decisions,
  RewriteRequest,
  RewriteProposal,
  Card,
} from "./types";
import { preview } from "./preview";
import { channelsOf, defaultStyle } from "./editorial";
import { RunActivity } from "./panels";
import SettingsView from "./SettingsView";
import { createDraftWriter } from "../core/draft-writer.mjs";
import BlogEditor, { BlogPreview } from "./BlogEditor";
import CardEditor, { CardPreviews } from "./CardEditor";
import { CardTextPreview } from "./CardTextEditor";
import { cardTextKey } from "../core/card-rich-text.mjs";
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

const NoticeContext = React.createContext<{
  message: string;
  dismiss: () => void;
} | null>(null);
function Notice({
  value,
}: {
  value: { message: string; dismiss: () => void } | null;
}) {
  return value?.message ? (
    <div className="notice" role="alert">
      <span>{value.message}</span>
      <button aria-label="Fechar aviso" onClick={value.dismiss}>
        <X size={16} />
      </button>
    </div>
  ) : null;
}
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
  const notice = React.useContext(NoticeContext);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ) || [],
      ).filter(
        (el) =>
          !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
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
        <Notice value={notice} />
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
const contentKey = (r?: Revision | null) =>
  JSON.stringify(r ? [r.article, r.caption, r.cards, r.style] : null);
const emptyDecisions: Decisions = {
  audience: "",
  objective: "",
  thesis: "",
  constraints: "",
};
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [id, setId] = useState("");
  const [screen, setScreen] = useState<"studio" | "settings">("studio");
  const [tab, setTab] = useState<Channel>("blog");
  const [panel, setPanel] = useState<
    "sources" | "chat" | "history" | "review" | null
  >(null);
  const [working, setWorking] = useState(""),
    [notice, setNotice] = useState("");
  const [nav, setNav] = useState(false),
    [creating, setCreating] = useState(false),
    [projectForm, setProjectForm] = useState(false);
  const [draft, setDraft] = useState<Revision | null>(null),
    [dirty, setDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false),
    [version, setVersion] = useState("");
  const [renderedRevision, setRenderedRevision] = useState("");
  const [message, setMessage] = useState(""),
    [steer, setSteer] = useState("");
  const [generating, setGenerating] = useState(false);
  const [rewriteTarget, setRewriteTarget] = useState<{
    target: RewriteRequest["target"];
    index?: number;
  } | null>(null);
  const [rewriteInstruction, setRewriteInstruction] = useState(
    "Melhore a clareza, preservando o significado.",
  );
  const [proposal, setProposal] = useState<
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
    session = p?.sessions?.at(-1);
  const operation = state?.operation,
    busy = !!working || !!operation;
  const selected = (p ? channelsOf(p) : []) as Channel[];
  const displayed = version
    ? p?.revisions.find((v) => v.id === version)
    : draft;
  const readOnly =
    !!version || (busy && (operation?.name || working) !== "rewrite");
  const current = useRef({ p, r, draft, dirty, settingsDirty });
  current.current = { p, r, draft, dirty, settingsDirty };
  const autosave = useMemo(
    () =>
      createDraftWriter(async (payload) => {
        const saved = await api.draft(payload);
        setState((previous) =>
          previous
            ? {
                ...previous,
                projects: previous.projects.map((project) =>
                  project.id === payload.id
                    ? { ...project, draft: saved }
                    : project,
                ),
              }
            : previous,
        );
        return saved;
      }),
    [],
  );
  const draftStatus = useSyncExternalStore(
    autosave.subscribe,
    autosave.getSnapshot,
  );
  useEffect(() => {
    api
      .state()
      .then((s: State | null) => {
        setState(s);
        setId(s?.projects[0]?.id || "");
      })
      .catch((e: Error) => setNotice(e.message));
    return () => autosave.dispose();
  }, []);
  useEffect(() => {
    const stored =
      p?.draft && p.draft.baseRevisionId === (r?.id || null) ? p.draft : null;
    const next = p
      ? structuredClone({ ...(r || emptyRevision(state)), ...stored?.content })
      : null;
    setDraft(next);
    setDirty(!!stored && contentKey(next) !== contentKey(r));
    setVersion("");
    setProposal(null);
  }, [id, r?.id, state?.workspaceId]);
  useEffect(() => {
    setPanel(null);
  }, [id, state?.workspaceId]);
  useEffect(() => {
    if (selected.length && !selected.includes(tab)) setTab(selected[0]);
  }, [id, JSON.stringify(selected), tab]);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    const refresh = () => {
      const owner = activeAction.current;
      return api
        .state()
        .then((s: State | null) => {
          if (active && activeAction.current === owner) setState(s);
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
      if (autosave.getSnapshot().pending || current.current.settingsDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    const off = (window.studio as any)?.onPrepareClose(async () => {
      try {
        await autosave.flush();
        await api.finishClose();
      } catch (error) {
        setNotice((error as Error).message);
      }
    });
    return () => {
      window.removeEventListener("beforeunload", handler);
      off?.();
    };
  }, [autosave]);
  async function act(name: string, payload?: any) {
    if (name === "cancel") {
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
    const action = Symbol(name);
    activeAction.current = action;
    setWorking(name);
    setNotice("");
    try {
      const result = await api[name](payload);
      if (result?.format) setState(result);
      else setState(await api.state());
      if (name === "open" && result?.format) {
        setId(result.projects[0]?.id || "");
        setScreen("studio");
      }
      if (name.endsWith("Test")) setNotice("Conexão verificada com sucesso.");
      if (result === true && name !== "cancel")
        setNotice("Operação concluída.");
      return result;
    } catch (error) {
      setNotice(
        (error as Error).message.replace(
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
      if (activeAction.current === action) {
        activeAction.current = null;
        setWorking("");
      }
    }
  }
  async function flush() {
    try {
      await autosave.flush();
      return true;
    } catch (error) {
      setNotice((error as Error).message);
      return false;
    }
  }
  async function leave(action: () => void) {
    if (!(await flush())) return;
    if (
      settingsDirty &&
      !confirm("Descartar as configurações ainda não salvas?")
    )
      return;
    setSettingsDirty(false);
    setProposal(null);
    setPanel(null);
    action();
    setNav(false);
  }
  function change(next: Revision) {
    if (!p) return;
    const changed = contentKey(next) !== contentKey(r);
    setDraft(next);
    setDirty(changed);
    current.current.draft = next;
    current.current.dirty = changed;
    autosave.schedule({
      id: p.id,
      baseRevisionId: r?.id || null,
      content: next,
    });
  }
  async function save() {
    if (!(await flush())) return null;
    const latest = current.current;
    if (!latest.p || !latest.draft) return null;
    if (latest.r && !latest.dirty) return state;
    return act("edit", {
      id: latest.p.id,
      content: latest.draft,
      baseRevisionId: latest.r?.id,
    });
  }
  async function generate(
    resume = false,
    mode: "research" | "adapt" = "research",
    targets = selected,
    instruction = "",
  ) {
    if (!p) return;
    if (resume && dirty) {
      setNotice(
        "O conteúdo foi editado. Inicie uma nova geração para usar o rascunho atual.",
      );
      return;
    }
    if (window.studio && (!state?.unlocked || !state.openrouterConfigured)) {
      setNotice(
        "Configure a chave OpenRouter em Configurações para usar a IA.",
      );
      return;
    }
    if (!resume && !(await save())) return;
    setGenerating(false);
    await act("run", {
      id: p.id,
      resume,
      mode,
      targets,
      instruction: resume ? steer : instruction,
    });
  }
  async function openPublish() {
    if (!(await save())) return;
    setVersion("");
    setRenderedRevision("");
    setPanel("review");
  }
  const originalText = (target: RewriteRequest["target"], index?: number) => {
    if (target !== "card") return draft?.[target] || "";
    const card = draft?.cards[index!];
    return card ? cardTextKey(card) : "";
  };
  async function requestRewrite() {
    if (!rewriteTarget || !draft || !p) return;
    const target = { ...rewriteTarget },
      original = originalText(target.target, target.index),
      ownerId = id;
    const saved = await save();
    if (!saved) return;
    const base = saved.projects
      .find((q: Project) => q.id === ownerId)
      ?.revisions.at(-1);
    if (!base) return;
    setRewriteTarget(null);
    const response = await act("rewrite", {
      id: ownerId,
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
        projectId: ownerId,
        index: target.index,
      });
  }
  const canApply =
    !!proposal &&
    proposal.projectId === id &&
    proposal.baseRevisionId === r?.id &&
    originalText(proposal.target, proposal.index) === proposal.original;
  async function applyProposal() {
    if (!proposal || !draft || !canApply) return;
    const next =
      proposal.target === "card"
        ? {
            ...draft,
            cards: draft.cards.map((c, i) =>
              i === proposal.index
                ? {
                    ...c,
                    titleRich: undefined,
                    bodyRich: undefined,
                    ...(proposal.value as Card),
                  }
                : c,
            ),
          }
        : { ...draft, [proposal.target]: proposal.value };
    change(next);
    setProposal(null);
    await save();
  }
  async function sendMessage() {
    if (!p || !message.trim() || !(await flush())) return;
    if (
      !chatRequest.current ||
      chatRequest.current.projectId !== id ||
      chatRequest.current.message !== message
    )
      chatRequest.current = { id: crypto.randomUUID(), projectId: id, message };
    if (await act("chat", { id, message, requestId: chatRequest.current.id })) {
      setMessage("");
      chatRequest.current = null;
    }
  }
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
  const operationBanner = busy && (
    <div className="notice operation-status" role="status" aria-live="polite">
      <span>
        {operation?.cancelRequested
          ? "Cancelando operação…"
          : operationNames[operation?.name || working] ||
            "Operação em andamento…"}
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
  );
  const noticeValue = { message: notice, dismiss: () => setNotice("") };
  return (
    <NoticeContext.Provider value={noticeValue}>
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
              onClick={() => leave(() => setCreating(true))}
            >
              <Plus size={18} />
            </button>
          </div>
          <nav className="projects" aria-label="Pautas">
            {state?.projects.map((project) => (
              <button
                key={project.id}
                disabled={busy}
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
              disabled={!state || busy}
              className={screen === "settings" ? "selected" : ""}
              onClick={() => leave(() => setScreen("settings"))}
            >
              <Settings size={18} />
              Configurações
            </button>
            <details>
              <summary>Workspace</summary>
              <button
                disabled={!state || busy}
                onClick={async () => {
                  if (await flush()) await act("backup");
                }}
              >
                <Archive size={18} />
                Copiar workspace
              </button>
            </details>
          </div>
        </aside>
        <main className="main">
          <header>
            <div className="breadcrumb">
              <button
                className="nav-toggle"
                aria-label="Abrir navegação"
                onClick={() => setNav(!nav)}
              >
                <PanelLeft size={18} />
              </button>
              <strong>
                {screen === "settings" ? "Configurações" : "Produção editorial"}
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
          {panel !== "chat" && operationBanner}
          {!panel &&
            !creating &&
            !projectForm &&
            !generating &&
            !rewriteTarget &&
            !proposal && <Notice value={noticeValue} />}
          {screen === "settings" && state ? (
            <SettingsView
              key={state.workspaceId || state.name}
              state={state}
              busy={busy}
              act={act}
              onDirty={setSettingsDirty}
            />
          ) : !p ? (
            <section className="welcome">
              <h1>Crie conteúdo com a sua voz.</h1>
              <p>
                Escreva para blog e Instagram, use suas imagens ou peça ajuda à
                IA.
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
                    {selected
                      .map((c) => (c === "blog" ? "Blog" : "Instagram"))
                      .join(" e ")}
                  </div>
                  <h1>{p.title}</h1>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setProjectForm(true)}
                  >
                    Briefing
                  </button>
                </div>
                <div className="actions">
                  <button
                    disabled={busy || !!version}
                    onClick={() => setGenerating(true)}
                  >
                    <Play size={16} />
                    {r?.article || r?.cards.length
                      ? "Gerar com IA"
                      : "Criar com IA"}
                  </button>
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !!version ||
                      !draft ||
                      (!draft.article.trim() && !draft.cards.length)
                    }
                    onClick={openPublish}
                  >
                    Publicar
                  </button>
                </div>
              </section>
              {p.draftError && <p role="alert">{p.draftError}</p>}
              {session && (
                <RunActivity
                  session={session}
                  channels={selected}
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
                    {selected.map((channel) => (
                      <button
                        role="tab"
                        aria-selected={tab === channel}
                        className={tab === channel ? "active" : ""}
                        key={channel}
                        onClick={() => setTab(channel)}
                      >
                        {channel === "blog" ? (
                          <FileText size={16} />
                        ) : (
                          <Images size={16} />
                        )}
                        {channel === "blog" ? "Blog" : "Instagram"}
                      </button>
                    ))}
                  </div>
                  <div className="editor-tools">
                    <span role="status" data-testid="draft-status">
                      {draftStatus.error
                        ? "Falha ao salvar rascunho"
                        : draftStatus.pending
                          ? "Salvando rascunho…"
                          : version
                            ? "Revisão histórica · somente leitura"
                            : dirty
                              ? "Rascunho salvo automaticamente"
                              : "Revisão salva"}
                    </span>
                    <div className="actions">
                      {draftStatus.error && (
                        <button onClick={flush}>Tentar salvar novamente</button>
                      )}
                      {version && (
                        <button onClick={() => setVersion("")}>
                          Voltar ao rascunho
                        </button>
                      )}
                      <details className="context-tools">
                        <summary>Ferramentas da pauta</summary>
                        <div className="actions">
                          {(
                            [
                              ["sources", "Fontes"],
                              ["chat", "Conversa"],
                              ["history", "Histórico"],
                            ] as const
                          ).map(([key, label]) => (
                            <button key={key} onClick={() => setPanel(key)}>
                              {label}
                            </button>
                          ))}
                          <button
                            disabled={busy || !!version || !window.studio}
                            onClick={async () => {
                              if (await flush())
                                await act("export", { id, draft: true });
                            }}
                          >
                            Exportar rascunho
                          </button>
                        </div>
                      </details>
                    </div>
                  </div>
                  {tab === "blog" && displayed && (
                    <>
                      <BlogEditor
                        key={(state?.workspaceId || "") + id + version}
                        value={displayed.article}
                        readOnly={readOnly}
                        onChange={(article) => change({ ...draft!, article })}
                      />
                      <div className="content-actions">
                        <button
                          disabled={
                            readOnly || busy || !displayed.article.trim()
                          }
                          onClick={() =>
                            setRewriteTarget({ target: "article" })
                          }
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
                      key={(state.workspaceId || "") + id}
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
              if (!(await flush())) return;
              const result = await act("create", { ...fields, manual: true });
              if (result) {
                setId(result.projects[0].id);
                setScreen("studio");
                setCreating(false);
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
        {generating && p && (
          <GenerationDialog
            project={p}
            canAdapt={!!draft?.article.trim()}
            busy={busy}
            onClose={() => setGenerating(false)}
            submit={(mode, targets, instruction) =>
              generate(false, mode, targets, instruction)
            }
          />
        )}
        {panel === "sources" && p && (
          <Modal title="Fontes" onClose={() => setPanel(null)}>
            <RevisionSources
              project={p}
              revision={version ? p.revisions.find((v) => v.id === version) : r}
            />
          </Modal>
        )}
        {panel === "history" && p && (
          <Modal title="Histórico" onClose={() => setPanel(null)}>
            <div className="content-pad">
              <label>
                Revisão exibida
                <select
                  aria-label="Revisão exibida"
                  value={version}
                  onChange={(e) => {
                    setVersion(e.target.value);
                    setPanel(null);
                  }}
                >
                  <option value="">Rascunho atual</option>
                  {p.revisions.map((revision, i) => (
                    <option key={revision.id} value={revision.id}>
                      Revisão {i + 1} ·{" "}
                      {new Date(revision.createdAt).toLocaleString("pt-BR")}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy || !dirty || !!version} onClick={save}>
                Criar revisão
              </button>
              {p.draft && p.draft.baseRevisionId !== (r?.id || null) && (
                <div className="inline-note">
                  <p>Existe um rascunho de uma revisão anterior.</p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      change({
                        ...(r || emptyRevision(state)),
                        ...p.draft!.content,
                      });
                      setVersion("");
                      setPanel(null);
                    }}
                  >
                    Recuperar rascunho anterior
                  </button>
                </div>
              )}
              {p.sessions
                ?.filter((s) => s.artifacts?.partial)
                .map((s) => (
                  <details key={s.id}>
                    <summary>
                      Resposta parcial · {s.artifacts!.partial!.role}
                    </summary>
                    <pre className="prose">{s.artifacts!.partial!.content}</pre>
                    {s.artifacts!.partial!.role === "writer" && (
                      <button
                        disabled={busy || !!version}
                        onClick={() => {
                          change({
                            ...draft!,
                            article: s.artifacts!.partial!.content,
                          });
                          setPanel(null);
                        }}
                      >
                        Usar texto parcial como rascunho
                      </button>
                    )}
                  </details>
                ))}
              {p.runs.map((run) => (
                <details key={run.id}>
                  <summary>
                    {run.role} · {run.phase || "produção"} · {run.status}
                  </summary>
                  <p>{run.model}</p>
                  {run.contextUsage && (
                    <p>
                      Contexto estimado: {run.contextUsage.estimatedInputTokens}
                      /{run.contextUsage.inputBudget} tokens · saída: até{" "}
                      {run.contextUsage.maxTokens}
                    </p>
                  )}
                  <p>
                    {run.usage?.total_tokens
                      ? `${run.usage.total_tokens} tokens informados pelo provedor`
                      : "Consumo não informado"}
                  </p>
                  {run.error && <p>{run.error}</p>}
                </details>
              ))}
              {p.messages
                .filter((m) => m.internal && (m as any).partial)
                .map((m, i) => (
                  <details key={i}>
                    <summary>Reescrita parcial preservada</summary>
                    <pre className="prose">{m.content}</pre>
                  </details>
                ))}
            </div>
          </Modal>
        )}
        {panel === "chat" && p && (
          <Modal title="Conversa" onClose={() => setPanel(null)}>
            {operationBanner}
            <div className="chat">
              <div className="messages">
                {p.messages
                  .filter((m) => !m.internal && !m.agent)
                  .map((m, i) => (
                    <article
                      key={i}
                      className={m.role === "user" ? "user-message" : ""}
                    >
                      <strong>
                        {m.role === "user" ? "Você" : "Assistente"}
                      </strong>
                      <pre className="prose">{m.content}</pre>
                      {["failed", "cancelled", "interrupted"].includes(
                        m.status || "",
                      ) && (
                        <small>
                          Resposta não concluída. Sua mensagem foi preservada.
                        </small>
                      )}
                      {m.role === "user" &&
                        m.requestId &&
                        ["failed", "cancelled", "interrupted"].includes(
                          m.status || "",
                        ) && (
                          <div className="chat-retry">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (
                                  await act("chat", {
                                    id,
                                    message: m.content,
                                    requestId: m.requestId,
                                  })
                                ) {
                                  if (chatRequest.current?.id === m.requestId) {
                                    chatRequest.current = null;
                                    setMessage("");
                                  }
                                }
                              }}
                            >
                              Tentar responder novamente
                            </button>
                          </div>
                        )}
                    </article>
                  ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage();
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
          </Modal>
        )}
        {panel === "review" && p && r && state && (
          <Modal title="Revisar e publicar" onClose={() => setPanel(null)}>
            <div className="review-content content-pad">
              <p>
                Revisão {p.revisions.length} · {p.title}
              </p>
              {selected.includes("blog") && (
                <details>
                  <summary>Conferir artigo</summary>
                  <BlogPreview value={r.article} />
                </details>
              )}
              {selected.includes("instagram") && (
                <section>
                  <CardPreviews
                    key={(state.workspaceId || "") + r.id}
                    revision={r}
                    api={api}
                    onRendered={setRenderedRevision}
                  />
                  <p className="caption-preview">{r.caption}</p>
                </section>
              )}
              <details
                className="review-feedback"
                data-review-status={p.reviewFeedback?.status || "none"}
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
                <pre className="prose">
                  {p.reviewFeedback?.content ||
                    "A revisão pode ser feita manualmente."}
                </pre>
              </details>
              <PublishDestinations
                project={p}
                state={state}
                busy={busy}
                dirty={dirty}
                renderedRevision={renderedRevision}
                act={act}
                openSettings={() => leave(() => setScreen("settings"))}
              />
              {selected.includes("blog") &&
                !state.settings.bloggerId &&
                !state.settings.wordpressUrl && (
                  <button
                    disabled={busy}
                    onClick={() => leave(() => setScreen("settings"))}
                  >
                    Conectar destino do blog
                  </button>
                )}
            </div>
          </Modal>
        )}
        {rewriteTarget && (
          <Modal
            title="Reescrever com IA"
            onClose={() => setRewriteTarget(null)}
          >
            <label>
              Orientação
              <textarea
                aria-label="Orientação para reescrita"
                value={rewriteInstruction}
                onChange={(e) => setRewriteInstruction(e.target.value)}
                maxLength={10000}
              />
            </label>
            <p>Você poderá comparar e escolher se aplica a sugestão.</p>
            <button
              className="primary"
              disabled={busy}
              onClick={requestRewrite}
            >
              Solicitar sugestão
            </button>
          </Modal>
        )}
        {proposal && (
          <Modal
            title="Sugestão de reescrita"
            onClose={() => setProposal(null)}
          >
            <div className="suggestion-comparison">
              <section>
                <h3>Original</h3>
                {proposal.target === "card" ? (
                  <CardTextPreview card={JSON.parse(proposal.original)} />
                ) : (
                  <pre>{proposal.original}</pre>
                )}
              </section>
              <section>
                <h3>Sugestão</h3>
                {typeof proposal.value === "string" ? (
                  <pre>{proposal.value}</pre>
                ) : (
                  <CardTextPreview card={proposal.value} />
                )}
              </section>
            </div>
            {!canApply && (
              <p role="alert">
                O texto ou a revisão mudou. Solicite uma nova sugestão.
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
    </NoticeContext.Provider>
  );
}
function GenerationDialog({
  project,
  canAdapt,
  busy,
  onClose,
  submit,
}: {
  project: Project;
  canAdapt: boolean;
  busy: boolean;
  onClose: () => void;
  submit: (
    mode: "research" | "adapt",
    targets: Channel[],
    instruction: string,
  ) => Promise<void>;
}) {
  const selected = channelsOf(project) as Channel[];
  const [targets, setTargets] = useState<Channel[]>(selected);
  const [mode, setMode] = useState<"research" | "adapt">(
    canAdapt ? "adapt" : "research",
  );
  const [instruction, setInstruction] = useState("");
  return (
    <Modal title="Gerar conteúdo" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(mode, targets, instruction);
        }}
      >
        {canAdapt && (
          <label>
            Operação
            <select
              aria-label="Operação de geração"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="adapt">
                Adaptar artigo salvo · sem nova pesquisa
              </option>
              <option value="research">Pesquisar e criar conteúdo novo</option>
            </select>
          </label>
        )}
        {selected.length > 1 && (
          <fieldset>
            <legend>Canais a gerar</legend>
            <div className="choice-row">
              {selected.map((channel) => (
                <label className="check" key={channel}>
                  <input
                    type="checkbox"
                    checked={targets.includes(channel)}
                    onChange={(e) =>
                      setTargets(
                        e.target.checked
                          ? [...targets, channel]
                          : targets.filter((c) => c !== channel),
                      )
                    }
                  />
                  {channel === "blog" ? "Blog" : "Instagram"}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label>
          Orientação desta geração
          <textarea
            maxLength={10000}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <button className="primary" disabled={busy || !targets.length}>
          {mode === "adapt" ? "Adaptar material" : "Pesquisar e criar"}
        </button>
      </form>
    </Modal>
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
  onSubmit: (fields: {
    title: string;
    brief: string;
    channels: Channel[];
    research: ResearchProvider[] | null;
    decisions: Decisions;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(project?.title || ""),
    [brief, setBrief] = useState(project?.brief || "");
  const [channels, setChannels] = useState<Channel[]>(
    project ? (channelsOf(project) as Channel[]) : ["blog"],
  );
  const [decisions, setDecisions] = useState<Decisions>(
    project?.decisions || emptyDecisions,
  );
  const [override, setOverride] = useState(!!project?.research),
    [research, setResearch] = useState<ResearchProvider[]>(
      project?.research || state.settings.research || ["pubmed"],
    );
  return (
    <Modal title={project ? "Briefing" : "Nova pauta"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit({
            title,
            brief,
            channels,
            decisions,
            research: override ? research : null,
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
            aria-label="Briefing"
            maxLength={200000}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="O que o conteúdo deve abordar"
          />
        </label>
        <fieldset>
          <legend>Canais desta pauta</legend>
          <div className="choice-row">
            {(["blog", "instagram"] as const).map((channel) => (
              <label className="check" key={channel}>
                <input
                  type="checkbox"
                  checked={channels.includes(channel)}
                  onChange={(e) =>
                    setChannels(
                      e.target.checked
                        ? [...channels, channel]
                        : channels.filter((c) => c !== channel),
                    )
                  }
                />
                {channel === "blog" ? "Blog" : "Instagram"}
              </label>
            ))}
          </div>
        </fieldset>
        <details className="project-decisions">
          <summary>Decisões permanentes da pauta</summary>
          {(
            [
              ["audience", "Público", 600],
              ["objective", "Objetivo", 600],
              ["thesis", "Tese", 1500],
              ["constraints", "Orientações que devem ser mantidas", 2000],
            ] as const
          ).map(([field, label, max]) => (
            <label key={field}>
              {label}
              <textarea
                maxLength={max}
                value={decisions[field]}
                onChange={(e) =>
                  setDecisions({ ...decisions, [field]: e.target.value })
                }
              />
            </label>
          ))}
        </details>
        <details>
          <summary>Ferramentas de pesquisa</summary>
          <label className="check">
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
            />
            Personalizar nesta pauta
          </label>
          <ResearchChoices
            value={research}
            disabled={!override}
            onChange={setResearch}
          />
        </details>
        <button
          className="primary"
          disabled={
            busy ||
            !title.trim() ||
            !channels.length ||
            (override && !research.length)
          }
        >
          {project ? "Salvar pauta" : "Criar pauta"}
        </button>
      </form>
    </Modal>
  );
}
