import type { Project, Revision } from "./types";
function Sources({ sources }: { sources: Project["sources"] }) {
  return (
    <>
      {sources.map((s, i) => (
        <article className="source" key={s.id || s.pmid || i}>
          <span className="tag">
            {s.provider === "web" ? "Web aberta" : s.pmid ? "PubMed" : "Fonte"}{" "}
            ·{" "}
            {s.access === "abstract"
              ? "Resumo consultado"
              : s.access === "excerpt"
                ? "Trechos consultados"
                : s.access === "demo"
                  ? "Demonstração antiga"
                  : "Metadados"}
            {s.pmid && ` · PMID ${s.pmid}`}
          </span>
          <h3>{s.title}</h3>
          <p>{s.abstract}</p>
          {s.url && (
            <a href={s.url} target="_blank" rel="noreferrer">
              Abrir fonte
            </a>
          )}
        </article>
      ))}
    </>
  );
}
export default function RevisionSources({
  project,
  revision,
}: {
  project: Project;
  revision?: Revision;
}) {
  const session = project.sessions?.at(-1);
  const sources = revision?.sources || [];
  const number = revision
    ? project.revisions.findIndex((r) => r.id === revision.id) + 1
    : 0;
  const pending =
    session &&
    (!revision || session.revisionId !== revision.id) &&
    !!session.artifacts?.sources;
  return (
    <div className="content-pad">
      <h2>{revision ? `Fontes da revisão ${number}` : "Fontes da pauta"}</h2>
      <p className="muted">
        {sources.length
          ? "Estas fontes pertencem à revisão selecionada, não à pesquisa mais recente."
          : revision?.sources === undefined && revision
            ? "Esta revisão antiga não possui fontes vinculadas. A pesquisa posterior não será atribuída a ela."
            : "Esta revisão não possui fontes externas vinculadas."}
      </p>
      {revision?.research?.searches?.map((search, i) => (
        <p className="search-record" key={i}>
          <strong>
            {search.provider === "pubmed" ? "PubMed" : "Web aberta"}
          </strong>{" "}
          · {search.query} · {search.count} fontes
        </p>
      ))}
      <Sources sources={sources} />
      {pending && (
        <details className="pending-research">
          <summary>
            Pesquisa de outra execução — não vinculada à revisão acima
          </summary>
          {session.artifacts?.searches?.map((search, i) => (
            <p className="search-record" key={i}>
              {search.query} · {search.count} fontes
            </p>
          ))}
          <Sources sources={session.artifacts?.sources || []} />
        </details>
      )}
    </div>
  );
}
