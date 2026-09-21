// The persisted cursor advances only after a successful stage. Failed attempts
// and retries must never be counted as additional completed stages.
export function runProgress(session, projectChannels = ["blog", "instagram"]) {
  const channels = session.channels || projectChannels;
  const stages = [
    ...(session.mode === "adapt"
      ? []
      : [
          {
            id: "search",
            label: "Pesquisa",
            detail: "Pesquisador: buscando fontes para a pauta.",
          },
          {
            id: "researcher",
            label: "Evidências",
            detail: "Pesquisador: organizando as evidências.",
          },
        ]),
    ...(channels.includes("blog")
      ? [
          {
            id: "writer",
            label: "Blog",
            detail: "Redator: escrevendo o artigo.",
          },
        ]
      : []),
    ...(channels.includes("instagram")
      ? [
          {
            id: "social",
            label: "Instagram",
            detail: "Social media: preparando a legenda e os cards.",
          },
        ]
      : []),
    {
      id: "reviewer",
      label: "Revisão",
      detail: "Revisor: conferindo o conteúdo e as fontes.",
    },
  ];
  const finished = session.status === "completed" || session.cursor === "done";
  const currentIndex = stages.findIndex((stage) => stage.id === session.cursor);
  const steps = stages.map((stage, index) => ({
    ...stage,
    state:
      finished || (currentIndex >= 0 && index < currentIndex)
        ? "complete"
        : index !== currentIndex
          ? "pending"
          : session.status === "running"
            ? "active"
            : session.status === "cancelled"
              ? "cancelled"
              : session.status === "interrupted"
                ? "interrupted"
                : "paused",
  }));
  return {
    steps,
    currentIndex: finished ? -1 : currentIndex,
    completed: steps.filter((step) => step.state === "complete").length,
  };
}
