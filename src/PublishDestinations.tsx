import { useState } from "react";
import type { Project, State } from "./types";
import { channelsOf } from "./editorial";
import { publicationView } from "../core/publication-view.mjs";

type Props = {
  project: Project;
  state: State;
  busy: boolean;
  dirty: boolean;
  renderedRevision: string;
  act: (name: string, payload?: any) => Promise<any>;
  openSettings: () => void;
};
function ManualRecovery({
  id,
  channel,
  disabled,
  act,
}: {
  id: string;
  channel: string;
  disabled: boolean;
  act: Props["act"];
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <details className="manual-recovery">
      <summary>O envio não apareceu no destino</summary>
      <p className="small muted">
        Confira a conta e a tentativa indicadas acima. Registrar esta
        conferência apenas libera uma nova tentativa; não publica nem remove
        conteúdo.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={disabled}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        Conferi o destino e o envio desta tentativa não foi publicado.
      </label>
      <button
        disabled={disabled || !confirmed}
        onClick={() =>
          act("reconcile", {
            id,
            channel,
            resolution: "not-published",
            confirmed: true,
          })
        }
      >
        Registrar conferência manual
      </button>
    </details>
  );
}
function Destination({ channel, ...props }: Props & { channel: string }) {
  const {
    project: p,
    state,
    busy,
    dirty,
    renderedRevision,
    act,
    openSettings,
  } = props;
  const [remoteId, setRemoteId] = useState("");
  const r = p.revisions.at(-1),
    publication = p.publications[channel];
  const name = (
    {
      blogger: "Blogger",
      wordpress: "WordPress",
      instagram: "Instagram",
      export: "Exportação local",
    } as Record<string, string>
  )[channel];
  const destination =
    channel === "blogger"
      ? state.settings.bloggerUrl
      : channel === "wordpress"
        ? state.settings.wordpressUrl
        : channel === "instagram"
          ? state.settings.instagramUsername || "Conta profissional"
          : "Materiais dos canais selecionados";
  const view = publicationView(p, state, channel, {
    desktop: !!window.studio,
    busy,
    dirty,
    awaitingCards:
      !!window.studio &&
      (channel === "instagram" ||
        (channel === "export" && channelsOf(p).includes("instagram"))) &&
      renderedRevision !== r?.id,
  });
  return (
    <div className="approval-row" data-destination={channel}>
      <div>
        <h3>{name}</h3>
        <p>{destination}</p>
        <span role="status">{view.status}</span>
        {view.reason && <p className="small muted">{view.reason}</p>}
        {publication?.recoveryNote && (
          <p className="small" role="status">
            {publication.recoveryNote}
          </p>
        )}
        {publication?.url && (
          <p>
            <a href={publication.url} target="_blank" rel="noreferrer">
              Abrir publicação
            </a>
          </p>
        )}
        {!publication?.url &&
          channel === "instagram" &&
          state.settings.instagramUsername &&
          ["published", "recover"].includes(view.mode) && (
            <p>
              <a
                href={`https://www.instagram.com/${encodeURIComponent(state.settings.instagramUsername)}/`}
                target="_blank"
                rel="noreferrer"
              >
                Conferir no perfil
              </a>
            </p>
          )}
      </div>
      {view.mode === "connect" ? (
        <button disabled={busy} onClick={openSettings}>
          Configurar {name}
        </button>
      ) : view.mode === "recover" ? (
        <div className="recovery-controls">
          {!state.unlocked && window.studio ? (
            <button disabled={busy} onClick={openSettings}>
              Desbloquear conexões
            </button>
          ) : (
            <>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await act("reconcile", {
                      id: p.id,
                      channel,
                      remoteId: remoteId.trim() || publication?.remoteId || "",
                    })
                  )
                    setRemoteId("");
                }}
              >
                <label>
                  ID do post correspondente a esta tentativa
                  <input
                    aria-label={`ID da publicação no ${name}`}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={remoteId}
                    disabled={busy}
                    onChange={(e) => setRemoteId(e.target.value)}
                    placeholder={
                      publication?.remoteId ||
                      (channel === "instagram"
                        ? "Opcional: verificar contêiner sem ID"
                        : "ID numérico do post publicado")
                    }
                    required={channel !== "instagram" && !publication?.remoteId}
                  />
                </label>
                <button
                  disabled={
                    !view.canCheck ||
                    (channel !== "instagram" &&
                      !remoteId.trim() &&
                      !publication?.remoteId)
                  }
                >
                  {remoteId.trim()
                    ? "Verificar e vincular post"
                    : "Verificar resultado"}
                </button>
              </form>
              <ManualRecovery
                id={p.id}
                channel={channel}
                disabled={!view.canCheck}
                act={act}
              />
            </>
          )}
        </div>
      ) : (
        view.mode !== "published" && (
          <>
            {!p.approval?.[channel] && (
              <button
                disabled={!view.canApprove}
                onClick={() => act("approve", { id: p.id, channel })}
              >
                Aprovar revisão
              </button>
            )}
            <button
              className="primary"
              disabled={!view.canPublish}
              onClick={() =>
                act(channel === "export" ? "export" : "publish", {
                  id: p.id,
                  channel,
                  urls: [],
                })
              }
            >
              {view.label}
              {channel === "export" ? "" : ` no ${name}`}
            </button>
          </>
        )
      )}
    </div>
  );
}
export default function PublishDestinations(props: Props) {
  const { project, state } = props;
  const channels = channelsOf(project)
    .flatMap((channel) =>
      channel === "instagram" ? ["instagram"] : ["blogger", "wordpress"],
    )
    .filter(
      (channel) =>
        channel === "instagram" ||
        (channel === "blogger"
          ? !!state.settings.bloggerId || !!project.publications.blogger
          : !!state.settings.wordpressUrl || !!project.publications.wordpress),
    );
  return (
    <div className="publish-destinations">
      {[...channels, "export"].map((channel) => (
        <Destination
          key={`${project.id}-${channel}`}
          {...props}
          channel={channel}
        />
      ))}
    </div>
  );
}
