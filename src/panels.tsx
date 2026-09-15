import { useEffect, useRef, useState } from "react";

import {
  CheckCheck,
  Activity,
  Send,
  Wrench,
  RotateCcw,
  Clock3,
} from "lucide-react";
import type { State, Project, RunEvent } from "./types";
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
  paused: "Aguardando nova tentativa",
  completed: "Concluído",
  published: "Publicado",
  uncertain: "Resultado incerto",
  sending: "Enviando",
  reconciled: "Reconciliado",
};
export function RunActivity({
  session,
  busy,
  steer,
  setSteer,
  resume,
}: {
  session: NonNullable<Project["sessions"]>[number];
  busy: boolean;
  steer: string;
  setSteer: (value: string) => void;
  resume: () => void;
}) {
  const log = useRef<HTMLDivElement>(null);
  const retryable =
    ["paused", "interrupted", "cancelled"].includes(session.status) &&
    session.cursor !== "done";
  const latest = session.events.at(-1);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [session.events.length]);
  const icon = (event: RunEvent) =>
    event.kind === "tool_call" ? (
      <Wrench size={14} />
    ) : event.kind === "user" ? (
      <Send size={14} />
    ) : event.kind === "tool_result" || event.kind === "output" ? (
      <CheckCheck size={14} />
    ) : event.kind === "error" ? (
      <RotateCcw size={14} />
    ) : (
      <Clock3 size={14} />
    );
  return (
    <section className={`run-activity ${session.status}`} aria-live="polite">
      <div className="run-summary">
        <Activity size={17} />
        <span>
          <b>{labels[session.status] || session.status}</b>
          <small>{latest?.title || "Execução registrada"}</small>
        </span>
        <span className="run-count">
          {session.events.length} evento
          {session.events.length === 1 ? "" : "s"}
        </span>
      </div>
      <details
        key={`${session.id}-${session.status}`}
        open={session.status === "running" || retryable}
      >
        <summary>Ver atividade dos agentes</summary>
        <div className="event-log" ref={log}>
          {session.events.map((event) => (
            <article className={`run-event ${event.kind}`} key={event.id}>
              <span className="event-icon">{icon(event)}</span>
              <div>
                <p>
                  <b>{event.role ? labels[event.role] : "Execução"}</b>
                  <time>
                    {new Date(event.at).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </p>
                <strong>{event.title}</strong>
                {event.detail && <small>{event.detail}</small>}
              </div>
            </article>
          ))}
        </div>
        <p className="activity-note">
          O workspace guarda etapas, ferramentas, resultados e orientações. O
          painel resume a atividade sem mostrar raciocínio interno bruto do
          modelo.
        </p>
        {retryable && (
          <form
            className="steer-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy) resume();
            }}
          >
            <label>
              Orientação para retomar <span>(opcional)</span>
              <textarea
                value={steer}
                disabled={busy}
                maxLength={10000}
                onChange={(event) => setSteer(event.target.value)}
                placeholder="Ex.: mantenha as fontes encontradas e torne a explicação mais direta."
              />
            </label>
            <button className="primary" disabled={busy}>
              <RotateCcw size={15} />
              {steer.trim() ? "Retomar com orientação" : "Tentar novamente"}
            </button>
          </form>
        )}
      </details>
    </section>
  );
}
export function SettingsPanel({
  state,
  busy,
  act,
  onDirty,
}: {
  state: State;
  busy: boolean;
  act: (name: string, payload?: any) => Promise<any>;
  onDirty: (dirty: boolean) => void;
}) {
  const [s, setS] = useState(state.settings),
    [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]),
    [password, setPassword] = useState(""),
    [rememberVault, setRememberVault] = useState(true),
    [openrouter, setKey] = useState(""),
    [wordpress, setWp] = useState(""),
    [connecting, setConnecting] = useState(false),
    [wpConnecting, setWpConnecting] = useState(false),
    [bloggerConnecting, setBloggerConnecting] = useState(false);
  const editableSettings = (value: State["settings"]) =>
    JSON.stringify([
      value.models,
      value.wordpressUrl,
      value.wordpressUser,
      value.wordpressProvider,
    ]);
  useEffect(
    () =>
      onDirty(
        !!password ||
          !!openrouter ||
          !!wordpress ||
          editableSettings(s) !== editableSettings(state.settings),
      ),
    [s, state.settings, password, openrouter, wordpress, onDirty],
  );
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
        com sua senha-mestra e pode ser reaberto pelo armazenamento seguro deste
        computador.
      </p>
      <section aria-label="Primeiro acesso" className="setup-guide">
        <h2>Conecte suas contas no seu computador</h2>
        <p>
          Você faz login diretamente no Google e no Instagram. Suas senhas
          permanecem nos provedores; o aplicativo salva somente as autorizações
          no cofre.
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
                remember: rememberVault,
              })
            ) {
              setPassword("");
              setKey("");
              setWp("");
            }
          }}
        >
          {!state.unlocked && (
            <>
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
              <label className="check vault-memory">
                <input
                  type="checkbox"
                  checked={rememberVault}
                  onChange={(e) => setRememberVault(e.target.checked)}
                />
                <span className="check-copy">
                  <strong>Lembrar neste computador</strong>
                  <small>
                    O sistema operacional protege a senha. Uma cópia aberta em
                    outro computador continuará pedindo a senha na primeira vez.
                  </small>
                </span>
              </label>
            </>
          )}
          <div className="split">
            <strong>OpenRouter</strong>
            <span className="tag">
              {state.openrouterConfigured
                ? "Chave salva"
                : state.unlocked
                  ? "Chave ausente"
                  : "Desbloqueie para conferir"}
            </span>
          </div>
          <label>
            Chave OpenRouter (necessária no modo conectado)
            <input
              type="password"
              autoComplete="off"
              value={openrouter}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                state.openrouterConfigured
                  ? "Deixe vazio para preservar a chave salva"
                  : "Cole sua chave OpenRouter"
              }
            />
          </label>
          <details>
            <summary>WordPress com hospedagem própria (opcional)</summary>
            <div className="form-grid">
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
            Campos vazios preservam as credenciais existentes. Guarde a
            senha-mestra para abrir uma cópia do workspace em outro computador.
          </p>
          {state.unlocked && state.vaultRemembered && (
            <p className="small success-note">
              Este workspace será desbloqueado automaticamente neste computador.
            </p>
          )}
          {state.vaultRememberError && (
            <p className="small warning-note">{state.vaultRememberError}</p>
          )}
          <div className="actions">
            <button disabled={busy}>
              {state.unlocked
                ? "Salvar credenciais"
                : "Criar ou desbloquear cofre"}
            </button>
            <button
              type="button"
              disabled={busy || !state.unlocked}
              onClick={() => act("lock")}
            >
              Bloquear e esquecer neste computador
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
          A conta precisa ser profissional, na modalidade criador ou empresa.
          Contas pessoais comuns não são compatíveis com a API de publicação.
        </p>
        <ol>
          <li>Use sua conta profissional de criador ou empresa.</li>
          <li>
            Clique em Conectar Instagram, autorize no navegador e volte para
            conferir seu @ aqui.
          </li>
        </ol>
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
        {state.unlocked && state.settings.instagramAccount && (
          <p className="small muted">
            {state.instagramMediaConfigured
              ? "Hospedagem temporária dos cards pronta para publicação direta."
              : "Reconecte uma vez nesta versão para ativar a publicação direta dos cards."}
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
            conta; nenhuma senha deve ser enviada ao responsável pelo
            aplicativo.
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
          Desconectar remove o token deste workspace. Revogue o aplicativo na
          conta Google para invalidar autorizações guardadas em outras cópias.
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
        onClick={() =>
          act("settings", {
            settings: {
              ...s,
              research: state.settings.research,
              cardStyle: state.settings.cardStyle,
            },
          })
        }
      >
        Salvar configurações
      </button>
    </section>
  );
}
