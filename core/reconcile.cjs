const providers = require("./providers.cjs");
const publishers = require("./publish.cjs");
const blogger = require("./blogger.cjs");
const normalizeHTML = (value) =>
  String(value || "")
    .replace(/\r/g, "")
    .replace(/>\s+</g, "><")
    .trim();
const normalizeURL = (value) => {
  try {
    return new URL(value).href.replace(/\/$/, "");
  } catch {
    return value;
  }
};
const now = () => new Date().toISOString();

async function reconcile(
  w,
  {
    id,
    channel = "wordpress",
    remoteId = "",
    resolution = "check",
    confirmed = false,
  },
  service,
) {
  if (!["wordpress", "blogger", "instagram"].includes(channel))
    throw Error("Destino inválido.");
  const p = w.project(id),
    previous = p.publications[channel],
    s = w.state.settings;
  if (!previous || !["uncertain", "sending"].includes(previous.status))
    throw Error("Não há tentativa pendente para verificar neste destino.");
  if (!w.secrets) throw Error("Desbloqueie as conexões antes de verificar.");
  remoteId = String(remoteId || previous.remoteId || "").trim();
  if (remoteId && !/^\d+$/.test(remoteId))
    throw Error("Informe o ID numérico da publicação.");
  const destination =
    channel === "wordpress"
      ? normalizeURL(s.wordpressUrl)
      : channel === "blogger"
        ? s.bloggerId
        : s.instagramAccount;
  if (
    previous.destination &&
    (channel === "wordpress"
      ? normalizeURL(previous.destination)
      : previous.destination) !== destination
  )
    throw Error("Reconecte o destino original para verificar esta tentativa.");
  const commit = (changes) => {
    Object.assign(previous, changes, { checkedAt: now() });
    w.save();
    return w.snapshot();
  };
  if (resolution === "not-published") {
    if (confirmed !== true)
      throw Error(
        "Confirme que você conferiu o destino e não encontrou o envio desta tentativa.",
      );
    (p.publicationHistory ||= []).push({
      channel,
      ...structuredClone(previous),
    });
    return commit({
      status: "failed",
      manualCheck: { resolution, at: now() },
      recoveryNote:
        "Você registrou que o envio desta tentativa não apareceu no destino. Esta é uma conferência manual, não uma confirmação da API. O histórico foi preservado e nenhum conteúdo foi reenviado. Uma nova tentativa exige clicar em publicar.",
    });
  }
  if (resolution !== "check") throw Error("Tipo de conferência inválido.");
  if (channel === "instagram") {
    if (!s.instagramAccount || !w.secrets.instagram)
      throw Error("Reconecte o Instagram.");
    const base = `https://graph.instagram.com/${s.graphVersion}`;
    const headers = { Authorization: "Bearer " + w.secrets.instagram };
    if (remoteId) {
      // An entered ID is explicitly linked, but is not claimed to prove identical images.
      let after = "",
        found = false;
      for (let page = 0; page < 10; page++) {
        const list = await providers.request(
          `${base}/${s.instagramAccount}/media?fields=id&limit=100${after ? "&after=" + encodeURIComponent(after) : ""}`,
          { headers },
        );
        if ((list.data || []).some((item) => String(item.id) === remoteId)) {
          found = true;
          break;
        }
        const next = list.paging?.cursors?.after;
        if (!list.paging?.next || !next || next === after) break;
        after = next;
      }
      if (!found)
        throw Error(
          "Esse ID não foi encontrado nas publicações consultadas desta conta. Confira o ID e a conta conectada.",
        );
      const media = await providers.request(
        `${base}/${remoteId}?fields=id,permalink,media_type,caption`,
        { headers },
      );
      if (String(media.id) !== remoteId)
        throw Error("A API não confirmou a publicação informada.");
      return commit({
        status: "reconciled",
        attemptedRevision: previous.revision,
        revision: undefined,
        remoteId,
        url: media.permalink || "",
        destination,
        recoveryNote:
          "Publicação vinculada pelo ID informado. A igualdade dos cards com a revisão local não foi verificada; nenhum novo post foi enviado.",
      });
    }
    if (
      !previous.containerId ||
      (previous.attemptVersion === 2 && !previous.publishAttemptedAt)
    ) {
      return commit({
        status: "failed",
        recoveryNote:
          "O envio foi interrompido antes da chamada de publicação. É possível tentar novamente; nada será reenviado automaticamente.",
      });
    }
    const container = await providers.request(
      `${base}/${previous.containerId}?fields=status_code`,
      { headers },
    );
    if (container.status_code === "PUBLISHED")
      return commit({
        status: "published",
        destination,
        recoveryNote:
          "A API confirmou que o contêiner desta tentativa foi publicado.",
      });
    // FINISHED is readiness, not proof of publication or proof of absence.
    return commit({
      status: "uncertain",
      recoveryNote: `A API ainda não confirmou a publicação (estado: ${container.status_code || "não informado"}). Confira novamente ou informe o ID do post já publicado para vinculá-lo. Nenhum envio foi repetido.`,
    });
  }
  if (!remoteId)
    throw Error("Informe o ID do post existente no destino indicado.");
  let post;
  if (channel === "wordpress") {
    const access = publishers.wordpressAccess(w);
    post = await providers.request(
      access.base +
        "/posts/" +
        remoteId +
        (access.wordpressCom ? "" : "?context=edit"),
      {
        headers: { Authorization: access.authorization },
      },
    );
    if (String(post.id || post.ID) !== remoteId || post.status !== "publish")
      throw Error(
        "O ID informado não corresponde a um post publicado nesse site.",
      );
  } else {
    const { token } = await blogger.verify(w, service);
    post = await providers.request(
      `https://www.googleapis.com/blogger/v3/blogs/${s.bloggerId}/posts/${remoteId}`,
      {
        headers: { Authorization: "Bearer " + token },
      },
    );
    if (
      String(post.id) !== remoteId ||
      String(post.blog?.id) !== s.bloggerId ||
      post.status !== "LIVE"
    )
      throw Error(
        "O Google não confirmou esse post publicado no blog selecionado.",
      );
  }
  const attempted = p.revisions.find((r) => r.id === previous.revision);
  const { renderBlog } = await import("./blog-html.mjs");
  const content =
    typeof post.content === "string"
      ? post.content
      : post.content?.raw || post.content?.rendered || "";
  const title =
    typeof post.title === "string"
      ? post.title
      : post.title?.raw || post.title?.rendered || "";
  const identical =
    !!attempted &&
    !!previous.title &&
    title === previous.title &&
    normalizeHTML(content) === normalizeHTML(renderBlog(attempted.article));
  return commit({
    status: "reconciled",
    attemptedRevision: previous.revision,
    revision: identical ? previous.revision : undefined,
    title: identical ? previous.title : title,
    remoteId,
    destination,
    url: post.link || post.URL || post.url || "",
    recoveryNote: identical
      ? "O destino confirmou o conteúdo da revisão enviada. Nenhum post foi reenviado."
      : "Post localizado e vinculado. O conteúdo remoto difere ou não pôde ser comparado integralmente; aprove e atualize para enviar a revisão atual ao mesmo post.",
  });
}
module.exports = { reconcile };
