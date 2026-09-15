import { useEffect, useState } from "react";
import type { Knowledge, State, ResearchProvider } from "./types";
import { knowledgeOf } from "./editorial";
const roles = ["researcher", "writer", "social", "reviewer"];
const roleNames = ["Pesquisador", "Redator", "Social media", "Revisor"];
type Props = {
  state: State;
  busy: boolean;
  act: (name: string, payload?: any) => Promise<any>;
  onDirty: (v: boolean) => void;
};
export default function SettingsView({ state, busy, act, onDirty }: Props) {
  const [models, setModels] = useState(state.settings.models);
  const [defaultModel, setDefaultModel] = useState(
    state.settings.models.writer || state.settings.models.social || "",
  );
  const [custom, setCustom] = useState(
    new Set(roles.map((role) => state.settings.models[role] || "")).size > 1,
  );
  const [catalog, setCatalog] = useState<{ id: string; name: string }[]>([]);
  const [research, setResearch] = useState<ResearchProvider[]>(
    state.settings.research || ["pubmed", "web"],
  );
  const [knowledge, setKnowledge] = useState<Knowledge>(knowledgeOf(state));
  const [password, setPassword] = useState(""),
    [key, setKey] = useState(""),
    [wpPassword, setWpPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [wpUrl, setWpUrl] = useState(state.settings.wordpressUrl),
    [wpUser, setWpUser] = useState(state.settings.wordpressUser);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setWpUrl(state.settings.wordpressUrl);
    setWpUser(state.settings.wordpressUser);
  }, [state.settings.wordpressUrl, state.settings.wordpressUser]);
  const changed =
    !!password ||
    !!key ||
    !!wpPassword ||
    JSON.stringify(models) !== JSON.stringify(state.settings.models) ||
    JSON.stringify(research) !==
      JSON.stringify(state.settings.research || ["pubmed", "web"]) ||
    JSON.stringify(knowledge) !== JSON.stringify(knowledgeOf(state)) ||
    wpUrl !== state.settings.wordpressUrl ||
    wpUser !== state.settings.wordpressUser;
  useEffect(() => {
    onDirty(changed);
    if (changed) setSaved(false);
  }, [changed, onDirty]);
  const save = async () => {
    if (password || key || wpPassword) {
      if (
        !(await act("vault", {
          password,
          values: { openrouter: key, wordpress: wpPassword },
          remember,
        }))
      )
        return;
      setPassword("");
      setKey("");
      setWpPassword("");
    }
    if (
      !(await act("settings", {
        settings: {
          ...state.settings,
          models,
          research,
          ...(state.settings.wordpressProvider !== "wordpress.com"
            ? { wordpressUrl: wpUrl, wordpressUser: wpUser }
            : {}),
        },
      }))
    )
      return;
    if (!(await act("knowledge", { knowledge }))) return;
    setSaved(true);
    onDirty(false);
  };
  const connectionButton = (provider: string, connected: boolean) => (
    <div className="actions">
      <button
        type="button"
        disabled={busy || !window.studio || !state.unlocked}
        onClick={() => act(provider + "Connect")}
      >
        {connected ? "Reconectar" : "Conectar"}{" "}
        {provider === "blogger"
          ? "Blogger"
          : provider === "wordpress"
            ? "WordPress.com"
            : "Instagram"}
      </button>
      {connected && (
        <>
          <button
            type="button"
            disabled={busy || !state.unlocked}
            onClick={() => act(provider + "Test")}
          >
            Verificar conexão
          </button>
          <button
            type="button"
            disabled={busy || !state.unlocked}
            onClick={() => act(provider + "Disconnect")}
          >
            Desconectar
          </button>
        </>
      )}
    </div>
  );
  return (
    <form
      className="settings compact-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="settings-heading">
        <h1>Configurações</h1>
        <button
          className="primary"
          disabled={busy || !research.length || !changed}
        >
          Salvar configurações
        </button>
      </div>
      {saved && <p role="status">Configurações salvas.</p>}
      <details open className="settings-group">
        <summary>IA</summary>
        {!state.unlocked && (
          <>
            <label>
              Senha do workspace
              <input
                type="password"
                minLength={10}
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Crie ou informe a senha deste workspace"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Lembrar neste computador
            </label>
          </>
        )}
        <label>
          Chave OpenRouter
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              state.openrouterConfigured
                ? "Chave salva; deixe vazio para manter"
                : "Cole sua chave"
            }
          />
        </label>
        {!custom && (
          <label>
            Modelo padrão
            <input
              list="model-catalog"
              value={defaultModel}
              onChange={(e) => {
                setDefaultModel(e.target.value);
                if (!custom)
                  setModels(
                    Object.fromEntries(roles.map((r) => [r, e.target.value])),
                  );
              }}
              placeholder="Selecione ou informe o ID do modelo"
            />
          </label>
        )}
        <div className="actions">
          <label className="check">
            <input
              type="checkbox"
              checked={custom}
              onChange={(e) => {
                setCustom(e.target.checked);
                if (!e.target.checked)
                  setModels(
                    Object.fromEntries(roles.map((r) => [r, defaultModel])),
                  );
              }}
            />
            Personalizar por função
          </label>
          <button
            type="button"
            disabled={busy || !window.studio}
            onClick={async () => {
              const result = await act("models");
              if (result) setCatalog(result);
            }}
          >
            Atualizar modelos
          </button>
        </div>
        {custom && (
          <div className="form-grid">
            {roles.map((role, i) => (
              <label key={role}>
                {roleNames[i]}
                <input
                  list="model-catalog"
                  value={models[role] || ""}
                  onChange={(e) =>
                    setModels({ ...models, [role]: e.target.value })
                  }
                />
              </label>
            ))}
          </div>
        )}
        <datalist id="model-catalog">
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
        <details className="research-settings">
          <summary>Ferramentas de pesquisa</summary>
          <div className="choice-row">
            {(["pubmed", "web"] as const).map((provider) => (
              <label className="check" key={provider}>
                <input
                  type="checkbox"
                  checked={research.includes(provider)}
                  onChange={(e) =>
                    setResearch(
                      e.target.checked
                        ? [...research, provider]
                        : research.filter((p) => p !== provider),
                    )
                  }
                />
                {provider === "web" ? "Web aberta" : "PubMed"}
              </label>
            ))}
          </div>
        </details>
        {state.unlocked && (
          <details>
            <summary>Acesso neste computador</summary>
            <button type="button" disabled={busy} onClick={() => act("lock")}>
              Bloquear e esquecer neste computador
            </button>
          </details>
        )}
        {state.vaultRememberError && (
          <p role="alert">{state.vaultRememberError}</p>
        )}
      </details>
      <details className="settings-group knowledge-panel">
        <summary>Voz e aparência</summary>
        <label>
          Preferências gerais
          <textarea
            maxLength={100000}
            value={knowledge.general}
            onChange={(e) =>
              setKnowledge({ ...knowledge, general: e.target.value })
            }
            placeholder="Tom de voz e regras essenciais de escrita"
          />
        </label>
        <details>
          <summary>Preferências por canal e exemplos</summary>
          {(
            [
              ["blog", "Blog"],
              ["instagram", "Instagram"],
              ["examples", "Exemplos de escrita"],
            ] as const
          ).map(([field, label]) => (
            <label key={field}>
              {label}
              <textarea
                maxLength={field === "examples" ? 40000 : 30000}
                value={knowledge[field]}
                onChange={(e) =>
                  setKnowledge({ ...knowledge, [field]: e.target.value })
                }
              />
            </label>
          ))}
        </details>
        <p className="small muted">
          Mantenha as regras essenciais no início. O perfil tem um limite por
          chamada; as decisões do briefing são preservadas integralmente. A
          aparência padrão dos cards pode ser salva no editor Instagram, em
          Aparência.
        </p>
      </details>
      <details className="settings-group">
        <summary>Destinos de publicação</summary>
        {!state.unlocked && (
          <p>
            Informe a senha e salve as configurações antes de conectar um
            destino.
          </p>
        )}
        <details id="setup-instagram">
          <summary>
            Instagram
            {state.settings.instagramUsername
              ? ` · @${state.settings.instagramUsername}`
              : " · não conectado"}
          </summary>
          <p>Use uma conta profissional de criador ou empresa.</p>
          {connectionButton("instagram", !!state.settings.instagramAccount)}
          {state.settings.instagramExpiresAt && (
            <p className="small">
              Autorização até{" "}
              {new Date(state.settings.instagramExpiresAt).toLocaleDateString(
                "pt-BR",
              )}
              .
            </p>
          )}
        </details>
        <details id="setup-blogger">
          <summary>
            Blogger
            {state.settings.bloggerId
              ? ` · ${state.settings.bloggerName || "conectado"}`
              : " · não conectado"}
          </summary>
          {connectionButton("blogger", !!state.settings.bloggerBlogs?.length)}
          {!!state.settings.bloggerBlogs?.length && (
            <label>
              Blog de destino
              <select
                disabled={busy || !state.unlocked}
                value={state.settings.bloggerId || ""}
                onChange={(e) => act("bloggerSelect", { id: e.target.value })}
              >
                <option value="" disabled>
                  Selecione o blog
                </option>
                {state.settings.bloggerBlogs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — {b.url}
                  </option>
                ))}
              </select>
            </label>
          )}
        </details>
        <details>
          <summary>
            WordPress
            {state.settings.wordpressUrl
              ? ` · ${state.settings.wordpressSiteName || state.settings.wordpressUrl}`
              : " · não conectado"}
          </summary>
          {connectionButton("wordpress", !!state.settings.wordpressSiteId)}
          {!state.settings.wordpressSiteId && (
            <details>
              <summary>Hospedagem própria</summary>
              <label>
                Site WordPress
                <input
                  type="url"
                  value={wpUrl}
                  onChange={(e) => setWpUrl(e.target.value)}
                  placeholder="https://seu-site.com"
                />
              </label>
              <label>
                Usuário
                <input
                  value={wpUser}
                  onChange={(e) => setWpUser(e.target.value)}
                />
              </label>
              <label>
                Senha de aplicativo
                <input
                  type="password"
                  autoComplete="off"
                  value={wpPassword}
                  onChange={(e) => setWpPassword(e.target.value)}
                  placeholder="Deixe vazio para manter"
                />
              </label>
            </details>
          )}
        </details>
      </details>
    </form>
  );
}
