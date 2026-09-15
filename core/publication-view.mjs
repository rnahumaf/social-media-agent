const confirmed = new Set(["published", "reconciled"]);
const normalizeURL = (value) => {
  try {
    return new URL(value).href.replace(/\/$/, "");
  } catch {
    return value || "";
  }
};
export function publicationView(project, state, channel, options = {}) {
  const r = project.revisions.at(-1);
  const publication = project.publications[channel];
  const s = state.settings;
  const selected = project.channels || ["blog", "instagram"];
  const accessReady =
    !options.desktop || channel === "export" || !!state[channel + "Configured"];
  const configured =
    channel === "export" ||
    (channel === "instagram"
      ? !!s.instagramAccount &&
        (!options.desktop || !!state.instagramMediaConfigured)
      : channel === "blogger"
        ? !!s.bloggerId
        : !!s.wordpressUrl &&
          (s.wordpressProvider === "wordpress.com"
            ? !!s.wordpressSiteId
            : !!s.wordpressUser));
  const destination =
    channel === "instagram"
      ? s.instagramAccount
      : channel === "blogger"
        ? s.bloggerId
        : normalizeURL(s.wordpressUrl);
  const otherDestination =
    channel !== "export" &&
    publication?.destination &&
    (channel === "wordpress"
      ? normalizeURL(publication.destination)
      : publication.destination) !== destination;
  const sameRevision =
    !!r &&
    publication?.revision === r.id &&
    (channel === "instagram" ||
      !publication?.title ||
      publication.title === project.title);
  const result = {
    mode: "publish",
    status: "Aguardando aprovação",
    reason: "",
    label: "Publicar",
    canApprove: false,
    canPublish: false,
    canCheck: false,
  };
  if (channel !== "export" && otherDestination)
    return {
      ...result,
      mode: "connect",
      status: "Destino alterado",
      reason:
        "Reconecte o destino original desta publicação para conferir ou atualizar o post.",
    };
  // Published Instagram posts are immutable in this product: never offer a second send.
  if (
    channel !== "export" &&
    confirmed.has(publication?.status) &&
    (sameRevision || channel === "instagram")
  ) {
    return {
      ...result,
      mode: "published",
      status: sameRevision
        ? "Esta revisão está publicada"
        : "Uma versão anterior foi publicada",
      reason: sameRevision
        ? ""
        : "A revisão atual não foi enviada. Para outra postagem no Instagram, crie uma nova pauta.",
    };
  }
  if (options.desktop && state.unlocked && !accessReady)
    return {
      ...result,
      mode: "connect",
      status: "Autorização ausente",
      reason:
        "Conecte este destino antes de publicar ou verificar uma tentativa.",
    };
  if (
    channel !== "export" &&
    ["sending", "uncertain"].includes(publication?.status)
  ) {
    const canCheck = !options.busy && (!options.desktop || !!state.unlocked);
    return {
      ...result,
      mode: "recover",
      status: "Resultado a conferir",
      canCheck,
      reason:
        options.desktop && !state.unlocked
          ? "Desbloqueie as conexões para verificar a tentativa anterior."
          : "Confira a tentativa anterior antes de enviar outro conteúdo.",
    };
  }
  if (
    !configured ||
    (channel !== "export" && options.desktop && !state.unlocked)
  )
    return {
      ...result,
      mode: "connect",
      status: configured ? "Conexões bloqueadas" : "Destino não conectado",
      reason: configured
        ? "Desbloqueie as conexões para publicar."
        : "Configure este destino antes de publicar.",
    };
  const needsBlog =
    channel === "export" ? selected.includes("blog") : channel !== "instagram";
  const needsSocial =
    channel === "export"
      ? selected.includes("instagram")
      : channel === "instagram";
  let reason = !r ? "Escreva e salve uma revisão primeiro." : "";
  if (r && needsBlog && !r.article.trim())
    reason = "Escreva o artigo antes de aprovar.";
  if (
    r &&
    needsSocial &&
    (!r.caption.trim() ||
      r.caption.length > 2200 ||
      r.cards.length < 2 ||
      r.cards.length > 10 ||
      r.cards.some(
        (c) =>
          c.title.length > 90 ||
          c.body.length > 420 ||
          (!c.title.trim() && !c.body.trim() && !c.image),
      ))
  )
    reason =
      "O carrossel precisa de 2 a 10 cards válidos e legenda de até 2.200 caracteres.";
  if (r?.demo && channel !== "export")
    reason = "Material de demonstração não pode ser publicado.";
  if (options.dirty)
    reason = "Salve as alterações antes de aprovar ou publicar.";
  if (options.awaitingCards && !reason)
    reason =
      "Aguarde a prévia dos cards. Corrija qualquer erro de renderização indicado acima.";
  const approved = !!project.approval?.[channel];
  const updating =
    channel !== "instagram" && channel !== "export" && !!publication?.remoteId;
  return {
    ...result,
    mode: updating ? "update" : "publish",
    reason,
    status:
      publication?.status === "failed"
        ? "Tentativa não publicada"
        : updating
          ? "Alterações ainda não publicadas"
          : approved
            ? "Revisão aprovada"
            : result.status,
    label:
      channel === "export"
        ? "Exportar"
        : updating
          ? "Atualizar"
          : publication?.status === "failed"
            ? "Tentar publicar novamente"
            : "Publicar",
    canApprove: !options.busy && !reason && !approved,
    canPublish: !options.busy && !reason && approved,
  };
}
