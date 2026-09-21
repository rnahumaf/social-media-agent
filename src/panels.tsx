import { useEffect, useRef, useState } from "react";

import {
  CheckCheck,
  Activity,
  Send,
  Wrench,
  RotateCcw,
  Clock3,
  Check,
  LoaderCircle,
  Pause,
  Square,
} from "lucide-react";
import type { Project, RunEvent, Channel } from "./types";
import { runProgress } from "../core/run-progress.mjs";
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
  channels,
}: {
  session: NonNullable<Project["sessions"]>[number];
  busy: boolean;
  steer: string;
  setSteer: (value: string) => void;
  resume: () => void;
  channels: Channel[];
}) {
  const log = useRef<HTMLDivElement>(null);
  const retryable =
    ["paused", "interrupted", "cancelled"].includes(session.status) &&
    session.cursor !== "done";
  const latest = session.events.at(-1);
  const progress = runProgress(session, channels);
  const stepLabels = {
    complete: "Concluída",
    active: "Em execução",
    pending: "A seguir",
    paused: "Pausada",
    cancelled: "Cancelada",
    interrupted: "Interrompida",
  };
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
    <section
      className={`run-activity ${session.status}`}
      aria-label="Progresso da geração"
    >
      <div className="run-summary">
        <Activity size={17} aria-hidden="true" />
        <span role="status" aria-live="polite" aria-atomic="true">
          <b>
            {session.status === "running" && progress.currentIndex >= 0
              ? `Etapa ${progress.currentIndex + 1} de ${progress.steps.length}: ${progress.steps[progress.currentIndex].label}`
              : labels[session.status] || session.status}
          </b>
          <small>
            {session.status === "running" && progress.currentIndex >= 0
              ? progress.steps[progress.currentIndex].detail
              : latest?.title || "Execução registrada"}
          </small>
        </span>
        <span className="run-count">
          {progress.completed} de {progress.steps.length} concluídas
        </span>
      </div>
      <ol className="run-timeline" aria-label="Etapas da geração">
        {progress.steps.map((step, index) => (
          <li
            key={step.id}
            className={step.state}
            data-step={step.id}
            aria-current={index === progress.currentIndex ? "step" : undefined}
          >
            <span className="timeline-marker" aria-hidden="true">
              {step.state === "complete" ? (
                <Check size={16} />
              ) : step.state === "active" ? (
                <LoaderCircle size={16} />
              ) : step.state === "paused" || step.state === "interrupted" ? (
                <Pause size={14} />
              ) : step.state === "cancelled" ? (
                <Square size={12} />
              ) : (
                index + 1
              )}
            </span>
            <span className="timeline-label">{step.label}</span>
            <small>{stepLabels[step.state]}</small>
          </li>
        ))}
      </ol>
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
