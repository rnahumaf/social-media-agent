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
      </div>
      <details key={`${session.id}-${session.status}`} open={retryable}>
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
