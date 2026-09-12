import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  FolderOpen,
  Plus,
  Settings,
  MessageSquare,
  FileText,
  Images,
  CheckCheck,
  ArrowRight,
  Play,
  Download,
  Search,
  Activity,
  Lock,
  PanelLeft,
  Send,
  Archive,
} from "lucide-react";
import type { State, Revision, Project } from "./types";
import { preview } from "./preview";
import "./style.css";
const api = window.studio || preview;
const labels: Record<string, string> = {
  researcher: "Pesquisador",
  writer: "Redator",
  social: "Social media",
  reviewer: "Revisor",
  briefing: "Briefing",
  running: "Em execução",
  review: "Em revisão",
  failed: "Falha",
  cancelled: "Cancelado",
  interrupted: "Interrompido",
  completed: "Concluído",
  published: "Publicado",
  uncertain: "Resultado incerto",
  sending: "Enviando",
  reconciled: "Reconciliado",
};
function App() {
  const [state, setState] = useState<State | null>(null),
    [id, setId] = useState(""),
    [tab, setTab] = useState("article"),
    [screen, setScreen] = useState("studio"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [creating, setCreating] = useState(false),
    [mobile, setMobile] = useState(false),
    [title, setTitle] = useState(""),
    [brief, setBrief] = useState(""),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState<Revision | null>(null),
    [dirty, setDirty] = useState(false),
    [version, setVersion] = useState(""),
    [urls, setUrls] = useState("");
  const p = state?.projects.find((p) => p.id === id),
    r = p?.revisions.at(-1);
  async function refresh() {
    const s = await api.state();
    setState(s);
    return s;
  }
  useEffect(() => {
    refresh()
      .then((s) => {
        if (s?.projects[0]) setId(s.projects[0].id);
        else if (s && window.studio) setScreen("settings");
      })
      .catch((e) => setNotice(e.message));
  }, []);
  useEffect(() => {
    setDraft(r ? structuredClone(r) : null);
    setDirty(false);
    setVersion("");
  }, [id, r?.id]);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      api
        .state()
        .then(setState)
        .catch(() => {});
    }, 1200);
    return () => clearInterval(timer);
  }, [busy]);
  async function act(name: string, payload?: any) {
    setBusy(true);
    setNotice("");
    try {
      const result = await api[name](payload);
      if (result?.format) {
        setState(result);
        if (name === "open") {
          setId(result.projects[0]?.id || "");
          setScreen(result.projects.length ? "studio" : "settings");
          setMobile(false);
        }
      } else if (result === true) setNotice("Operação concluída.");
      if (["bloggerTest", "wordpressTest", "instagramTest"].includes(name))
        setNotice("Conexão verificada com sucesso.");
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      await refresh().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  function change(field: string, value: any) {
    if (draft) {
      setDraft({ ...draft, [field]: value });
      setDirty(true);
    }
  }
  const shown = version ? p?.revisions.find((v) => v.id === version) : draft;
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "shown" : "")}>
        <div className="brand">
          <BookOpen size={23} />
          <span>
            Social Media Agent<small>ESTÚDIO EDITORIAL</small>
          </span>
        </div>
        <button
          className="workspace"
          onClick={() => act("open")}
          disabled={busy}
        >
          <FolderOpen size={18} />
          <span>
            {state?.name || "Abrir workspace"}
            <small>Pasta local e portável</small>
          </span>
        </button>
        <div className="section-label">
          PRODUÇÃO{" "}
          <button
            aria-label="Nova pauta"
            onClick={() => setCreating(true)}
            disabled={!state || busy}
          >
            <Plus size={17} />
          </button>
        </div>
        <nav className="projects">
          {!state?.projects.length && (
            <p className="muted small">Suas pautas aparecerão aqui.</p>
          )}
          {state?.projects.map((project) => (
            <button
              key={project.id}
              className={
                id === project.id && screen === "studio" ? "selected" : ""
              }
              onClick={() => {
                if (dirty && !confirm("Descartar as edições ainda não salvas?"))
                  return;
                setId(project.id);
                setScreen("studio");
                setMobile(false);
              }}
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
            onClick={() => {
              setScreen("settings");
              setMobile(false);
            }}
          >
            <Settings size={18} /> Modelos e conexões
          </button>
          <button disabled={busy || !state} onClick={() => act("backup")}>
            <Archive size={18} /> Copiar workspace
          </button>
          <div className="alpha">
            <span>ALFA 0.1</span>
            <p>
              Esboço experimental.
              <br />
              Ainda fora do uso cotidiano.
            </p>
          </div>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            <button
              className="menu"
              aria-label="Abrir navegação"
              onClick={() => setMobile(!mobile)}
            >
              <PanelLeft size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>
              {screen === "settings" ? "Configurações" : "Produção editorial"}
            </strong>
          </div>
          <span className="mode">
            {!window.studio
              ? "Prévia no navegador"
              : state?.settings.demo
                ? "Demonstração local"
                : "OpenRouter conectado"}
          </span>
        </header>
        {notice && (
          <div className="notice" role="alert">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Fechar aviso">
              ×
            </button>
          </div>
        )}
        {screen === "settings" && state ? (
          <SettingsPanel state={state} busy={busy} act={act} />
        ) : !p ? (
          <section className="welcome">
            <div className="eyebrow">DA IDEIA À PUBLICAÇÃO</div>
            <h1>
              Conteúdo com fontes.
              <br />
              Decisões nas suas mãos.
            </h1>
            <p>
              Reúna pesquisa, artigo e carrossel em um projeto.
              <br />
              Converse com os agentes, revise os materiais e aprove cada
              entrega.
            </p>
            <div className="welcome-flow">
              {["Pesquise", "Escreva", "Adapte", "Revise"].map((v, i) => (
                <React.Fragment key={v}>
                  <span>
                    <b>0{i + 1}</b>
                    {v}
                  </span>
                  {i < 3 && <ArrowRight size={18} />}
                </React.Fragment>
              ))}
            </div>
            <button
              className="primary"
              disabled={busy}
              onClick={() => (state ? setCreating(true) : act("open"))}
            >
              {state ? <Plus size={18} /> : <FolderOpen size={18} />}{" "}
              {state ? "Criar primeira pauta" : "Escolher pasta de trabalho"}
            </button>
            <p className="small muted">
              {window.studio
                ? "Abra a mesma pasta em outro computador para continuar."
                : "Prévia interativa: os exemplos ficam apenas neste navegador."}
            </p>
          </section>
        ) : (
          <>
            <section className="project-header">
              <div>
                <div className="eyebrow">
                  PAUTA • {labels[p.status] || p.status}
                </div>
                <h1>{p.title}</h1>
                <p>{p.brief || "Sem orientações adicionais."}</p>
              </div>
              <div className="actions">
                {busy ? (
                  <button onClick={() => api.cancel()}>
                    <Activity size={17} /> Cancelar geração
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={dirty}
                    onClick={() => act("run", { id })}
                  >
                    <Play size={16} />
                    {r ? "Gerar nova versão" : "Iniciar produção"}
                  </button>
                )}
              </div>
            </section>
            <section className="pipeline">
              {["researcher", "writer", "social", "reviewer"].map((role, i) => {
                const run = p.runs.filter((r) => r.role === role).at(-1);
                return (
                  <div
                    key={role}
                    className={
                      run?.status === "completed"
                        ? "done"
                        : run?.status === "running"
                          ? "active"
                          : ""
                    }
                  >
                    <span className="step-number">
                      {run?.status === "completed" ? (
                        <CheckCheck size={17} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span>
                      {labels[role]}
                      <small>
                        {run ? labels[run.status] || run.status : "Aguardando"}
                      </small>
                    </span>
                    {i < 3 && <ArrowRight className="step-arrow" size={15} />}
                  </div>
                );
              })}
            </section>
            <div className="production">
              <section className="editor-panel">
                <div className="tabs">
                  {[
                    ["article", "Artigo", FileText],
                    ["social", "Carrossel", Images],
                    ["sources", "Fontes", Search],
                    ["brief", "Briefing", BookOpen],
                    ["chat", "Conversa", MessageSquare],
                    ["review", "Aprovação", CheckCheck],
                  ].map(([key, label, Icon]: any) => (
                    <button
                      key={key}
                      className={tab === key ? "active" : ""}
                      onClick={() => setTab(key)}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {(tab === "article" || tab === "social") && (
                  <div className="editor-tools">
                    <span>
                      {r
                        ? `${p.revisions.length} revisão(ões)`
                        : "Nenhum material gerado"}
                    </span>
                    {r && (
                      <div>
                        <select
                          aria-label="Revisão exibida"
                          value={version}
                          onChange={(e) => {
                            if (
                              dirty &&
                              !confirm("Descartar as edições ainda não salvas?")
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
                        <button
                          disabled={busy || !dirty || !!version}
                          onClick={() => act("edit", { id, content: draft })}
                        >
                          Salvar revisão
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {tab === "article" &&
                  (shown ? (
                    <textarea
                      aria-label="Artigo em Markdown"
                      className="article"
                      value={shown.article}
                      readOnly={!!version || busy}
                      onChange={(e) => change("article", e.target.value)}
                    />
                  ) : (
                    <Empty
                      title="Seu artigo começa no briefing"
                      body="Inicie a produção para reunir as fontes e gerar a primeira versão."
                    />
                  ))}
                {tab === "social" &&
                  (shown ? (
                    <div className="social-content">
                      <p className="muted small">
                        Cards de 1080 × 1350 px. Salve as alterações antes de
                        aprovar.
                      </p>
                      <div className="cards">
                        {shown.cards.map((card, i) => (
                          <div className="card-edit" key={i}>
                            <CardImage cards={shown.cards} index={i} />
                            <label>
                              Título do card {i + 1}
                              <input
                                maxLength={90}
                                value={card.title}
                                readOnly={!!version || busy}
                                onChange={(e) =>
                                  change(
                                    "cards",
                                    shown.cards.map((c, j) =>
                                      j === i
                                        ? { ...c, title: e.target.value }
                                        : c,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <label>
                              Texto
                              <textarea
                                maxLength={420}
                                value={card.body}
                                readOnly={!!version || busy}
                                onChange={(e) =>
                                  change(
                                    "cards",
                                    shown.cards.map((c, j) =>
                                      j === i
                                        ? { ...c, body: e.target.value }
                                        : c,
                                    ),
                                  )
                                }
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                      <label>
                        Legenda e hashtags
                        <textarea
                          value={shown.caption}
                          readOnly={!!version || busy}
                          onChange={(e) => change("caption", e.target.value)}
                        />
                      </label>
                    </div>
                  ) : (
                    <Empty
                      title="Uma ideia por card"
                      body="O agente social media adapta o artigo depois da redação."
                    />
                  ))}
                {tab === "brief" && (
                  <BriefEditor
                    key={p.id}
                    project={p}
                    busy={busy}
                    save={(fields) => act("update", { id, ...fields })}
                  />
                )}
                {tab === "sources" && (
                  <div className="content-pad">
                    <h2>Dossiê de evidências</h2>
                    <p className="muted">
                      Última busca no PubMed:{" "}
                      {p.query || "Nenhuma busca externa executada"}. Os
                      registros distinguem resumo e metadados; não implicam
                      leitura do texto completo.
                    </p>
                    {p.sources.map((s) => (
                      <article className="source" key={s.pmid}>
                        <span className="tag">
                          {s.access === "abstract"
                            ? "Resumo consultado"
                            : s.access === "demo"
                              ? "Demonstração"
                              : "Apenas metadados"}{" "}
                          • PMID {s.pmid}
                        </span>
                        <h3>{s.title}</h3>
                        <p>{s.abstract}</p>
                        {s.url && <p className="small">{s.url}</p>}
                      </article>
                    ))}
                    {p.messages
                      .filter(
                        (m) =>
                          m.agent === "researcher" && m.role === "assistant",
                      )
                      .slice(-1)
                      .map((m, i) => (
                        <pre className="prose" key={i}>
                          {m.content}
                        </pre>
                      ))}
                  </div>
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
                            <span className="eyebrow">
                              {m.role === "user"
                                ? "Você"
                                : labels[m.agent || ""] || "Assistente"}
                            </span>
                            <pre className="prose">{m.content}</pre>
                          </article>
                        ))}
                      {!p.messages.length && (
                        <Empty
                          title="Uma conversa que acompanha a pauta"
                          body="Registre o público, o tom e as decisões para orientar os agentes."
                        />
                      )}
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await act("chat", { id, message })) setMessage("");
                      }}
                    >
                      <textarea
                        aria-label="Mensagem"
                        placeholder="Dê uma orientação ou converse sobre o projeto…"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        maxLength={10000}
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
                  <div className="content-pad">
                    <h2>Confira antes de compartilhar</h2>
                    {r && (
                      <div className="cards">
                        {r.cards.map((_, i) => (
                          <CardImage key={i} cards={r.cards} index={i} />
                        ))}
                      </div>
                    )}
                    <p>
                      A aprovação pertence à revisão atual e à conta de destino.
                      Salvar uma edição exige uma nova aprovação.
                    </p>
                    {dirty && (
                      <p className="notice">
                        Há alterações não salvas. Salve uma revisão antes de
                        aprovar.
                      </p>
                    )}
                    {p.messages
                      .filter(
                        (m) => m.agent === "reviewer" && m.role === "assistant",
                      )
                      .slice(-1)
                      .map((m, i) => (
                        <pre className="review-notes prose" key={i}>
                          {m.content}
                        </pre>
                      ))}
                    {["export", "wordpress", "blogger", "instagram"].map(
                      (channel) => (
                        <div className="approval-row" key={channel}>
                          <div>
                            <h3>
                              {channel === "export"
                                ? "Exportação local"
                                : channel === "wordpress"
                                  ? "WordPress"
                                  : channel === "blogger"
                                    ? "Blogger"
                                    : "Instagram"}
                            </h3>
                            <p>
                              {channel === "export"
                                ? "Markdown, legenda, JPEGs e fontes"
                                : channel === "wordpress"
                                  ? state?.settings.wordpressUrl ||
                                    "Configure o site em Modelos e conexões"
                                  : channel === "blogger"
                                    ? state?.settings.bloggerUrl ||
                                      "Conecte e escolha um blog"
                                    : state?.settings.instagramUsername ||
                                      state?.settings.instagramAccount ||
                                      "Configure a conta profissional"}
                            </p>
                            {p.publications[channel] && (
                              <span className="tag">
                                {labels[p.publications[channel].status] ||
                                  p.publications[channel].status}{" "}
                                {p.publications[channel].remoteId &&
                                  `• ID ${p.publications[channel].remoteId}`}
                              </span>
                            )}
                          </div>
                          <button
                            disabled={busy || !r || dirty}
                            onClick={() => act("approve", { id, channel })}
                          >
                            {p.approval?.[channel]
                              ? "Reafirmar aprovação"
                              : "Aprovar revisão"}
                          </button>
                          <button
                            disabled={
                              busy || !r || dirty || !p.approval?.[channel]
                            }
                            onClick={() =>
                              act(channel === "export" ? "export" : "publish", {
                                id,
                                channel,
                                urls: urls
                                  .split("\n")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                          >
                            {channel === "export" ? (
                              <Download size={16} />
                            ) : (
                              <ArrowRight size={16} />
                            )}{" "}
                            {channel === "export" ? "Exportar" : "Publicar"}
                          </button>
                        </div>
                      ),
                    )}
                    <label>
                      URLs públicas dos JPEGs para Instagram (uma por linha)
                      <textarea
                        value={urls}
                        onChange={(e) => setUrls(e.target.value)}
                        placeholder="https://seu-site.com/card-1.jpg"
                      />
                    </label>
                    <p className="small muted">
                      Integração Instagram experimental. Exporte os JPEGs,
                      hospede os arquivos sem alterá-los e informe as URLs na
                      ordem dos cards. Conecte sua conta em Modelos e conexões.
                    </p>
                  </div>
                )}
              </section>
              <aside className="inspector">
                <div className="section-label">NESTE PROJETO</div>
                <div className="stat">
                  <FileText size={17} />
                  <span>
                    Artigo
                    <b>{r ? "Markdown • editável" : "Aguardando redação"}</b>
                  </span>
                </div>
                <div className="stat">
                  <Images size={17} />
                  <span>
                    Carrossel
                    <b>
                      {r
                        ? `${r.cards.length} cards • 4:5`
                        : "Aguardando artigo"}
                    </b>
                  </span>
                </div>
                <div className="stat">
                  <Search size={17} />
                  <span>
                    Fontes<b>{p.sources.length} registros</b>
                  </span>
                </div>
                <hr />
                <div className="section-label">AGENTES E MODELOS</div>
                {["researcher", "writer", "social", "reviewer"].map((role) => (
                  <div className="agent" key={role}>
                    <span>{labels[role]}</span>
                    <small>
                      {state?.settings.demo
                        ? "Demonstração local"
                        : state?.settings.models[role] || "Escolha um modelo"}
                    </small>
                  </div>
                ))}
                <hr />
                <div className="section-label">ÚLTIMAS EXECUÇÕES</div>
                {!p.runs.length && (
                  <p className="muted small">
                    O histórico aparecerá após a primeira execução.
                  </p>
                )}
                {p.runs.slice(-6).map((run) => (
                  <div className="agent" key={run.id}>
                    <span>
                      {run.phase === "search"
                        ? "Pesquisador · busca"
                        : labels[run.role]}{" "}
                      <small>{labels[run.status] || run.status}</small>
                    </span>
                    <small>
                      {run.usage?.total_tokens
                        ? `${run.usage.total_tokens} tokens`
                        : "Consumo não informado"}
                      {typeof run.usage?.cost === "number"
                        ? ` • US$ ${run.usage.cost.toFixed(4)}`
                        : ""}
                    </small>
                  </div>
                ))}
                <div className="local-note">
                  <Lock size={16} />
                  <p>
                    Histórico local.
                    <br />A publicação passa por você.
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
      {creating && (
        <div className="overlay">
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              const s = await act("create", { title, brief });
              if (s) {
                setId(s.projects[0].id);
                setCreating(false);
                setScreen("studio");
                setTitle("");
                setBrief("");
              }
            }}
          >
            <div className="eyebrow">NOVO PROJETO</div>
            <h2>Qual é a próxima pauta?</h2>
            <label>
              Tema
              <input
                autoFocus
                required
                maxLength={180}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Como comunicar ciência com clareza"
              />
            </label>
            <label>
              Briefing
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Público, objetivo, tom e perguntas a responder"
              />
            </label>
            <p className="small muted">
              O pesquisador define a busca no PubMed a partir da sua pauta. A
              demonstração não faz buscas externas.
            </p>
            <div className="actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </button>
              <button className="primary" disabled={busy}>
                Criar pauta <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
function CardImage({
  cards,
  index,
}: {
  cards: Revision["cards"];
  index: number;
}) {
  const [images, setImages] = useState<string[]>([]),
    [error, setError] = useState("");
  const serialized = JSON.stringify(cards);
  useEffect(() => {
    if (!window.studio) return;
    let active = true;
    setImages([]);
    const timer = setTimeout(
      () =>
        api
          .render({ cards })
          .then((result) => {
            if (active) {
              setImages(result);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError(e.message);
          }),
      200,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [serialized]);
  const card = cards[index];
  if (window.studio)
    return images[index] ? (
      <img
        className="rendered-card"
        src={images[index]}
        alt={`Card ${index + 1}: ${card.title}`}
      />
    ) : (
      <p role="status">{error || "Renderizando JPEG…"}</p>
    );
  return (
    <div className="carousel-card">
      <div className="card-brand">ESTÚDIO EDITORIAL</div>
      <h2>{card.title}</h2>
      <p>{card.body}</p>
      <footer>
        {index + 1} / {cards.length}
      </footer>
    </div>
  );
}
function BriefEditor({
  project,
  busy,
  save,
}: {
  project: Project;
  busy: boolean;
  save: (fields: object) => Promise<any>;
}) {
  const [title, setTitle] = useState(project.title),
    [brief, setBrief] = useState(project.brief),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="content-pad"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(!!(await save({ title, brief })));
      }}
    >
      <h2>Orientações da pauta</h2>
      <p className="muted small">
        Descreva o que deseja comunicar. O pesquisador define e atualiza a busca
        no PubMed ao gerar uma nova versão.
      </p>
      <label>
        Tema
        <input
          required
          maxLength={180}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label>
        Briefing
        <textarea
          value={brief}
          onChange={(e) => {
            setBrief(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <p className="muted small">
        Salvar preserva os materiais existentes e invalida a aprovação. Gere uma
        nova versão para aplicar estas orientações ao conteúdo.
      </p>
      <button className="primary" disabled={busy}>
        Salvar briefing
      </button>
      {saved && <p role="status">Briefing salvo.</p>}
    </form>
  );
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty">
      <FileText size={28} />
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}
function SettingsPanel({
  state,
  busy,
  act,
}: {
  state: State;
  busy: boolean;
  act: (name: string, payload?: any) => Promise<any>;
}) {
  const [s, setS] = useState(state.settings),
    [memory, setMemory] = useState(state.memory),
    [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]),
    [password, setPassword] = useState(""),
    [openrouter, setKey] = useState(""),
    [wordpress, setWp] = useState(""),
    [connecting, setConnecting] = useState(false),
    [wpConnecting, setWpConnecting] = useState(false),
    [bloggerConnecting, setBloggerConnecting] = useState(false);
  useEffect(() => {
    setS((previous) => ({
      ...previous,
      instagramAccount: state.settings.instagramAccount,
      instagramUsername: state.settings.instagramUsername,
      instagramExpiresAt: state.settings.instagramExpiresAt,
    }));
  }, [
    state.settings.instagramAccount,
    state.settings.instagramUsername,
    state.settings.instagramExpiresAt,
  ]);
  useEffect(() => {
    setS((previous) => ({
      ...previous,
      wordpressProvider: state.settings.wordpressProvider,
      wordpressSiteId: state.settings.wordpressSiteId,
      wordpressSiteName: state.settings.wordpressSiteName,
      wordpressUrl: state.settings.wordpressUrl,
    }));
  }, [
    state.settings.wordpressProvider,
    state.settings.wordpressSiteId,
    state.settings.wordpressUrl,
  ]);
  useEffect(() => {
    setS((previous) => ({
      ...previous,
      bloggerId: state.settings.bloggerId,
      bloggerUrl: state.settings.bloggerUrl,
      bloggerName: state.settings.bloggerName,
      bloggerBlogs: state.settings.bloggerBlogs,
    }));
  }, [
    state.settings.bloggerId,
    state.settings.bloggerUrl,
    state.settings.bloggerName,
    state.settings.bloggerBlogs,
  ]);
  return (
    <section className="settings">
      <div className="eyebrow">SEU AMBIENTE DE PRODUÇÃO</div>
      <h1>Modelos e conexões</h1>
      <p className="muted">
        A pasta de trabalho guarda o histórico. O cofre protege as credenciais
        com sua senha-mestra.
      </p>
      <section aria-label="Primeiro acesso" className="setup-guide">
        <h2>Conecte suas contas no seu computador</h2>
        <p>
          Você faz login diretamente no Google e no Instagram. O responsável
          pelo teste não precisa conhecer suas senhas. As autorizações são
          salvas automaticamente no cofre.
        </p>
        <div className="actions">
          {[
            [
              "setup-vault",
              state.unlocked ? "1. Cofre desbloqueado" : "1. Abrir cofre",
            ],
            [
              "setup-instagram",
              state.settings.instagramUsername
                ? "2. Instagram conectado"
                : "2. Instagram",
            ],
            [
              "setup-blogger",
              state.settings.bloggerId ? "3. Blogger conectado" : "3. Blogger",
            ],
          ].map(([target, label]) => (
            <button
              key={target}
              onClick={() => {
                const el = document.getElementById(target);
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {!window.studio && (
          <p className="small muted">
            Esta é uma prévia. Para conectar contas, use o executável recebido
            para teste.
          </p>
        )}
      </section>
      <section id="setup-vault">
        <div className="split">
          <h2>1. Proteja suas conexões</h2>
          <span className="tag">
            {state.unlocked ? "Desbloqueado" : "Bloqueado"}
          </span>
        </div>
        <p>
          Crie uma senha para o cofre deste aplicativo. Se já criou, use a mesma
          senha para desbloquear. Esta senha não é a do Google nem a do
          Instagram.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              await act("vault", {
                password,
                values: { openrouter, wordpress },
              })
            ) {
              setPassword("");
              setKey("");
              setWp("");
            }
          }}
        >
          <label>
            Senha-mestra (mínimo de 10 caracteres)
            <input
              type="password"
              autoComplete="off"
              minLength={10}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <details>
            <summary>
              Chaves para geração de conteúdo e WordPress próprio (opcional)
            </summary>
            <div className="form-grid">
              <label>
                Chave OpenRouter
                <input
                  type="password"
                  autoComplete="off"
                  value={openrouter}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
              <label>
                Senha WordPress (hospedagem própria)
                <input
                  type="password"
                  autoComplete="off"
                  value={wordpress}
                  onChange={(e) => setWp(e.target.value)}
                />
              </label>
            </div>
          </details>
          <p className="small muted">
            Campos vazios preservam as credenciais existentes. A senha-mestra
            não é salva. Guarde-a para abrir o cofre em outro computador.
          </p>
          <div className="actions">
            <button disabled={busy}>Criar ou desbloquear cofre</button>
            <button
              type="button"
              disabled={busy || !state.unlocked}
              onClick={() => act("lock")}
            >
              Bloquear cofre
            </button>
          </div>
        </form>
      </section>{" "}
      <section id="setup-instagram">
        <div className="split">
          <h2>2. Conecte o Instagram</h2>
          <span className="tag">
            {state.settings.instagramUsername
              ? `@${state.settings.instagramUsername}`
              : "Não conectado"}
          </span>
        </div>
        <p>
          Conecte sua conta profissional e autorize o acesso ao perfil e a
          publicação de conteúdos. Sua senha é informada somente no Instagram.
        </p>
        <p className="small muted">
          Neste alfa, peça ao responsável pelo teste um convite e aceite-o nas
          configurações do Instagram antes de conectar. A conta precisa ser de
          criador ou empresa; contas pessoais comuns não são compatíveis.
        </p>
        <ol>
          <li>Use sua conta profissional de criador ou empresa.</li>
          <li>
            Aceite o convite do Social Media Agent Alpha nas configurações do
            Instagram.
          </li>
          <li>
            Clique em Conectar Instagram, autorize no navegador e volte para
            conferir seu @ aqui.
          </li>
        </ol>
        <button
          disabled={busy || !window.studio}
          onClick={() => act("instagramInvites")}
        >
          Abrir convites do Instagram
        </button>
        {connecting && (
          <p role="status">
            Conclua a autorização no navegador do seu computador. Ao terminar,
            volte a esta janela. Não envie sua senha a ninguém.
          </p>
        )}
        {state.settings.instagramExpiresAt && (
          <p className="small muted">
            Autorização válida até{" "}
            {new Date(state.settings.instagramExpiresAt).toLocaleDateString(
              "pt-BR",
            )}
            . Reconecte se o acesso expirar ou for revogado.
          </p>
        )}
        {!window.studio && (
          <p className="small muted">
            Esta prévia não conecta contas. Abra o aplicativo desktop para
            autorizar o Instagram.
          </p>
        )}
        {!state.unlocked && window.studio && (
          <p className="small muted">
            Desbloqueie o cofre na etapa 1 para guardar a autorização com
            segurança.
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={busy || !window.studio || !state.unlocked}
            onClick={async () => {
              setConnecting(true);
              try {
                await act("instagramConnect");
              } finally {
                setConnecting(false);
              }
            }}
          >
            {connecting
              ? "Aguardando autorização no navegador…"
              : state.settings.instagramAccount
                ? "Reconectar Instagram"
                : "Conectar Instagram"}
          </button>
          {connecting && (
            <button onClick={() => act("cancel")}>Cancelar conexão</button>
          )}
          {state.settings.instagramAccount && (
            <>
              <button
                disabled={busy || !state.unlocked}
                onClick={() => act("instagramTest")}
              >
                Verificar conexão
              </button>
              <button
                disabled={busy || !state.unlocked}
                onClick={() => act("instagramDisconnect")}
              >
                Desconectar deste workspace
              </button>
            </>
          )}
        </div>
        <p className="small muted">
          Cada publicação continua exigindo sua aprovação. Desconectar remove a
          autorização deste workspace; para revogar também outras cópias, remova
          o aplicativo nas configurações do Instagram.
        </p>
      </section>{" "}
      <section id="setup-blogger">
        <div className="split">
          <h2>3. Conecte o Blogger</h2>
          <span className="tag">
            {state.settings.bloggerId ? "Conectado" : "Não conectado"}
          </span>
        </div>
        <p>
          Entre com Google para conectar seu blog. A autorização permite
          gerenciar o Blogger; cada publicação no aplicativo exige sua
          aprovação.
        </p>
        <ol>
          <li>
            Clique em Conectar Blogger com Google e escolha a conta que
            administra o blog.
          </li>
          <li>
            Autorize no navegador e volte ao aplicativo. Se houver mais de um
            blog, escolha o destino abaixo.
          </li>
          <li>
            Confira o endereço e clique em Verificar conexão. Isso não publica
            conteúdo.
          </li>
        </ol>
        {bloggerConnecting && (
          <p role="status">
            Aguardando você autorizar o Google no navegador. Use a sua própria
            conta; nenhuma senha deve ser enviada ao responsável pelo alfa.
          </p>
        )}
        {state.settings.bloggerUrl && (
          <p>
            {state.settings.bloggerName} — {state.settings.bloggerUrl}
          </p>
        )}
        {!!state.settings.bloggerBlogs?.length && (
          <label>
            Blog de destino
            <select
              disabled={busy || !state.unlocked}
              value={state.settings.bloggerId || ""}
              onChange={(e) => act("bloggerSelect", { id: e.target.value })}
            >
              <option value="" disabled>
                Escolha um blog
              </option>
              {state.settings.bloggerBlogs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.url}
                </option>
              ))}
            </select>
          </label>
        )}
        {!window.studio ? (
          <p className="small muted">
            Abra o aplicativo desktop para conectar seu blog. Esta prévia não
            acessa contas.
          </p>
        ) : (
          !state.unlocked && (
            <p className="small muted">
              Desbloqueie o cofre na etapa 1 antes de conectar.
            </p>
          )
        )}
        <div className="actions">
          <button
            disabled={busy || !state.unlocked || !window.studio}
            onClick={async () => {
              setBloggerConnecting(true);
              try {
                await act("bloggerConnect");
              } finally {
                setBloggerConnecting(false);
              }
            }}
          >
            {bloggerConnecting
              ? "Aguardando Google…"
              : state.settings.bloggerBlogs?.length
                ? "Reconectar Blogger"
                : "Conectar Blogger com Google"}
          </button>
          {bloggerConnecting && (
            <button onClick={() => act("cancel")}>Cancelar conexão</button>
          )}
          {state.settings.bloggerId && (
            <button
              disabled={busy || !state.unlocked}
              onClick={() => act("bloggerTest")}
            >
              Verificar conexão
            </button>
          )}
          {!!state.settings.bloggerBlogs?.length && (
            <button
              disabled={busy || !state.unlocked}
              onClick={() => act("bloggerDisconnect")}
            >
              Desconectar Blogger
            </button>
          )}
        </div>
        <p className="small muted">
          Neste alfa, sua conta Google precisa estar cadastrada como testadora.
          O Google pode exigir nova autorização após sete dias. Desconectar
          remove o token deste workspace; revogue o app na conta Google para
          invalidar outras cópias.
        </p>
      </section>
      <section>
        <h2>Modo de trabalho</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={s.demo}
            onChange={(e) => setS({ ...s, demo: e.target.checked })}
          />{" "}
          Usar demonstração local, sem chamadas pagas
        </label>
        <p className="small muted">
          No modo conectado, briefing, fontes e contexto editorial são enviados
          ao OpenRouter. A busca é enviada ao PubMed.
        </p>
      </section>
      <section>
        <div className="split">
          <h2>Um modelo para cada papel</h2>
          <button
            disabled={busy}
            onClick={async () => {
              const m = await act("models");
              if (m) setCatalog(m);
            }}
          >
            Atualizar catálogo
          </button>
        </div>
        <div className="form-grid">
          {["researcher", "writer", "social", "reviewer"].map((role) => (
            <label key={role}>
              {labels[role]}
              <input
                list="model-catalog"
                placeholder="Selecione ou informe o ID do modelo"
                value={s.models[role]}
                onChange={(e) =>
                  setS({
                    ...s,
                    models: { ...s.models, [role]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <datalist id="model-catalog">
          {catalog.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
        <p className="small muted">
          Sem troca silenciosa de modelo. Cada chamada tem limite de 5.000
          tokens de saída.
        </p>
      </section>
      <section>
        <h2>Memória editorial</h2>
        <label>
          Regras preservadas entre sessões
          <textarea
            value={memory}
            onChange={(e) => setMemory(e.target.value)}
          />
        </label>
      </section>
      <section>
        <h2>WordPress.com</h2>
        <p>
          Entre na sua conta e escolha o site que deseja conectar. Autorize
          posts e mídia na tela do WordPress.com.
        </p>
        {state.settings.wordpressSiteId && (
          <p>
            <strong>
              {state.settings.wordpressSiteName || "Site conectado"}
            </strong>
            <br />
            {state.settings.wordpressUrl}
          </p>
        )}
        {!window.studio && (
          <p className="small muted">
            Abra o aplicativo desktop para conectar seu site. Esta prévia não
            acessa contas.
          </p>
        )}
        {window.studio && !state.unlocked && (
          <p className="small muted">
            Desbloqueie o cofre na etapa 1 antes de conectar.
          </p>
        )}
        <div className="actions">
          <button
            className="primary"
            disabled={busy || !window.studio || !state.unlocked}
            onClick={async () => {
              setWpConnecting(true);
              try {
                await act("wordpressConnect");
              } finally {
                setWpConnecting(false);
              }
            }}
          >
            {wpConnecting
              ? "Aguardando autorização…"
              : state.settings.wordpressSiteId
                ? "Reconectar WordPress.com"
                : "Conectar WordPress.com"}
          </button>
          {wpConnecting && (
            <button onClick={() => act("cancel")}>Cancelar conexão</button>
          )}
          {state.settings.wordpressSiteId && (
            <>
              <button
                disabled={busy || !state.unlocked}
                onClick={() => act("wordpressTest")}
              >
                Verificar site
              </button>
              <button
                disabled={busy || !state.unlocked}
                onClick={() => act("wordpressDisconnect")}
              >
                Desconectar site deste workspace
              </button>
            </>
          )}
        </div>
        <p className="small muted">
          Desconectar remove o token deste workspace. Para revogar o acesso de
          outras cópias, remova a conexão nas configurações do WordPress.com.
        </p>
        {!state.settings.wordpressSiteId && (
          <details>
            <summary>Meu WordPress usa hospedagem própria</summary>
            <div className="form-grid">
              <label>
                Site WordPress (HTTPS)
                <input
                  value={s.wordpressUrl}
                  onChange={(e) =>
                    setS({
                      ...s,
                      wordpressUrl: e.target.value,
                      wordpressProvider: "selfhosted",
                    })
                  }
                  placeholder="https://seu-site.com"
                />
              </label>
              <label>
                Usuário WordPress
                <input
                  value={s.wordpressUser}
                  onChange={(e) =>
                    setS({ ...s, wordpressUser: e.target.value })
                  }
                />
              </label>
            </div>
            <p className="small muted">
              Informe a senha de aplicativo no cofre e salve as configurações.
            </p>
          </details>
        )}
      </section>
      <button
        className="primary"
        disabled={busy}
        onClick={() => act("settings", { settings: s, memory })}
      >
        Salvar configurações
      </button>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
