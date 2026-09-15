const { assertApproved, current } = require("./workspace.cjs");
const { request } = require("./providers.cjs");
const { failureStatus } = require("./publication-errors.cjs");
function httpsBase(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error(
      "Informe um endereço HTTPS sem credenciais, parâmetros ou fragmentos.",
    );
  return url.href.replace(/\/$/, "");
}
function wordpressAccess(w) {
  const s = w.state.settings;
  if (s.wordpressProvider === "wordpress.com") {
    if (!/^\d+$/.test(s.wordpressSiteId || "") || !w.secrets?.wordpressCom)
      throw Error("Conecte o WordPress.com e desbloqueie o cofre.");
    return {
      base: `https://public-api.wordpress.com/rest/v1.1/sites/${s.wordpressSiteId}`,
      wordpressCom: true,
      authorization: `Bearer ${w.secrets.wordpressCom}`,
    };
  }
  if (!s.wordpressUser || !w.secrets?.wordpress)
    throw Error(
      "Configure o usuário e desbloqueie a senha de aplicativo WordPress.",
    );
  return {
    base: httpsBase(s.wordpressUrl) + "/wp-json/wp/v2",
    authorization:
      "Basic " +
      Buffer.from(s.wordpressUser + ":" + w.secrets.wordpress).toString(
        "base64",
      ),
  };
}
async function wordpress(w, id) {
  const p = w.project(id),
    s = w.state.settings;
  assertApproved(p, s, "wordpress");
  const revision = current(p);
  if (revision.demo)
    throw Error(
      "Material de demonstração não pode ser publicado. Gere uma nova revisão no modo conectado.",
    );
  const previous = p.publications.wordpress;
  if (previous?.status === "uncertain" || previous?.status === "sending")
    throw Error(
      "Resultado anterior incerto. Confira o WordPress antes de qualquer nova tentativa.",
    );
  if (
    previous?.revision === revision.id &&
    ["published", "reconciled"].includes(previous.status) &&
    (!previous.title || previous.title === p.title)
  )
    return previous;
  const url = httpsBase(s.wordpressUrl);
  if (previous?.destination && previous.destination !== url)
    throw Error(
      "Este projeto já tem publicação em outro site. Use uma nova pauta para outro destino.",
    );
  const access = wordpressAccess(w);
  const { renderBlog } = await import("./blog-html.mjs");
  const html = renderBlog(revision.article);
  if (previous)
    (p.publicationHistory ||= []).push({
      channel: "wordpress",
      ...structuredClone(previous),
    });
  p.publications.wordpress = {
    title: p.title,
    url: previous?.url,
    status: "sending",
    revision: revision.id,
    remoteId: previous?.remoteId,
    destination: url,
  };
  w.save();
  try {
    const post = await request(
      access.base +
        "/posts" +
        (previous?.remoteId
          ? "/" + previous.remoteId
          : access.wordpressCom
            ? "/new"
            : ""),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: access.authorization,
        },
        body: JSON.stringify({
          title: p.title,
          content: html,
          status: "publish",
          ...(access.wordpressCom ? { publicize: false } : {}),
        }),
      },
    );
    const remoteId = post.id || post.ID;
    if (!remoteId) throw Error("Resposta sem identificador remoto.");
    p.publications.wordpress = {
      title: p.title,
      status: "published",
      revision: revision.id,
      remoteId,
      destination: url,
      url: post.link || post.URL,
      at: new Date().toISOString(),
    };
    w.save();
    return p.publications.wordpress;
  } catch (e) {
    p.publications.wordpress.status = failureStatus(e);
    w.save();
    throw Error(
      p.publications.wordpress.status === "failed"
        ? "O WordPress recusou o envio. Confira a conexão antes de tentar novamente."
        : "Resultado da publicação incerto. Use Verificar resultado no WordPress; nenhum envio será repetido automaticamente.",
    );
  }
}
async function instagram(w, id, urls = [], service) {
  const p = w.project(id),
    s = w.state.settings;
  assertApproved(p, s, "instagram");
  const r = current(p);
  if (r.demo)
    throw Error(
      "Material de demonstração não pode ser publicado. Gere uma nova revisão no modo conectado.",
    );
  const previous = p.publications.instagram;
  if (previous && previous.status !== "failed")
    throw Error(
      "Já existe uma tentativa para este projeto. Confira a conta; o aplicativo não repete publicações Instagram com resultado incerto.",
    );
  if (
    !/^v\d+\.\d+$/.test(s.graphVersion) ||
    !/^\d+$/.test(s.instagramAccount) ||
    !w.secrets?.instagram
  )
    throw Error(
      "Configure a conta profissional, a versão Graph e o token Instagram.",
    );
  if (!Array.isArray(urls)) throw Error("As URLs dos cards são inválidas.");
  let hosted = [];
  if (!urls.length) {
    const media = require("./media-host.cjs");
    if (!service || !w.secrets?.instagramMedia)
      throw Error(
        "Reconecte o Instagram para habilitar a hospedagem temporária dos cards.",
      );
    const images = await approvedImages(w, p, r);
    try {
      for (let index = 0; index < r.cards.length; index++) {
        const image = images[index];
        hosted.push(
          await media.upload(service, w.secrets.instagramMedia, image),
        );
      }
      urls = hosted.map((item) => item.url);
    } catch (error) {
      await Promise.allSettled(
        hosted.map((item) =>
          media.remove(service, w.secrets.instagramMedia, item),
        ),
      );
      throw error;
    }
  }
  if (urls.length !== r.cards.length || urls.length < 2 || urls.length > 10)
    throw Error("Informe uma URL pública JPEG por card, na mesma ordem.");
  try {
    urls.forEach(httpsBase);
    const images = await approvedImages(w, p, r);
    for (let i = 0; i < urls.length; i++) {
      const response = await fetch(urls[i], {
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw Error(`Não foi possível verificar o JPEG do card ${i + 1}.`);
      const remote = Buffer.from(await response.arrayBuffer());
      const expected = images[i];
      if (!remote.equals(expected))
        throw Error(
          `O JPEG público do card ${i + 1} difere da revisão aprovada. Hospede o arquivo exportado sem conversão.`,
        );
    }
  } catch (error) {
    if (hosted.length) {
      const media = require("./media-host.cjs");
      await Promise.allSettled(
        hosted.map((item) =>
          media.remove(service, w.secrets.instagramMedia, item),
        ),
      );
    }
    throw error;
  }
  const base = `https://graph.instagram.com/${s.graphVersion}/${s.instagramAccount}`;
  const headers = {
    Authorization: "Bearer " + w.secrets.instagram,
    "Content-Type": "application/json",
  };
  if (previous)
    (p.publicationHistory ||= []).push({
      channel: "instagram",
      ...structuredClone(previous),
    });
  p.publications.instagram = {
    attemptVersion: 2,
    destination: s.instagramAccount,
    title: p.title,
    status: "sending",
    revision: r.id,
    urls,
    children: [],
  };
  w.save();
  try {
    for (const image_url of urls) {
      const child = await request(base + "/media", {
        method: "POST",
        headers,
        body: JSON.stringify({ image_url, is_carousel_item: true }),
      });
      if (!child.id) throw Error("Contêiner não criado.");
      p.publications.instagram.children.push(child.id);
      w.save();
    }
    const parent = await request(base + "/media", {
      method: "POST",
      headers,
      body: JSON.stringify({
        media_type: "CAROUSEL",
        children: p.publications.instagram.children,
        caption: r.caption,
      }),
    });
    if (!parent.id) throw Error("Contêiner não criado.");
    p.publications.instagram.containerId = parent.id;
    w.save();
    let ready = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const status = await request(
        `https://graph.instagram.com/${s.graphVersion}/${parent.id}?fields=status_code`,
        { headers },
      );
      if (status.status_code === "FINISHED") {
        ready = true;
        break;
      }
      if (["ERROR", "EXPIRED"].includes(status.status_code))
        throw Error("Falha de processamento na Meta.");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!ready) throw Error("Processamento ainda não concluído.");
    p.publications.instagram.publishAttemptedAt = new Date().toISOString();
    w.save();
    const result = await request(base + "/media_publish", {
      method: "POST",
      headers,
      body: JSON.stringify({ creation_id: parent.id }),
    });
    if (!result.id) throw Error("Publicação sem identificador.");
    Object.assign(p.publications.instagram, {
      status: "published",
      remoteId: result.id,
      at: new Date().toISOString(),
    });
    if (hosted.length) {
      const media = require("./media-host.cjs");
      const cleanup = await Promise.allSettled(
        hosted.map((item) =>
          media.remove(service, w.secrets.instagramMedia, item),
        ),
      );
      p.publications.instagram.temporaryMedia = cleanup.every(
        (item) => item.status === "fulfilled",
      )
        ? "removed"
        : "cleanup_pending";
    }
    w.save();
    return p.publications.instagram;
  } catch (e) {
    p.publications.instagram.status = failureStatus(
      e,
      !!p.publications.instagram.publishAttemptedAt,
    );
    w.save();
    throw Error(
      p.publications.instagram.status === "failed"
        ? "O envio não foi publicado. Corrija o erro e tente novamente quando estiver pronto."
        : "Tentativa Instagram não confirmada. Use Verificar resultado; nenhum envio será repetido automaticamente.",
    );
  }
}
async function approvedImages(w, p, r) {
  const images = await require("./render.cjs").renderJPEGs(
    w.dir,
    r.cards,
    r.style,
  );
  const hashes = images.map(require("./assets.cjs").hash);
  if (JSON.stringify(hashes) !== JSON.stringify(p.approvalMedia))
    throw Error("A renderização mudou. Confira os cards e aprove novamente.");
  return images;
}
module.exports = {
  wordpressAccess,
  wordpress,
  instagram,
  httpsBase,
  approvedImages,
};
