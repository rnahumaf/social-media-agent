const { assertApproved, current } = require("./workspace.cjs");
const { request } = require("./providers.cjs");
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
async function wordpress(w, id) {
  const p = w.project(id),
    s = w.state.settings;
  assertApproved(p, s, "wordpress");
  if (s.demo) throw Error("Desative a demonstração antes de publicar.");
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
  if (previous?.revision === revision.id && previous.status === "published")
    return previous;
  const url = httpsBase(s.wordpressUrl);
  if (previous?.destination && previous.destination !== url)
    throw Error(
      "Este projeto já tem publicação em outro site. Use uma nova pauta para outro destino.",
    );
  if (!s.wordpressUser || !w.secrets?.wordpress)
    throw Error(
      "Configure o usuário e desbloqueie a senha de aplicativo WordPress.",
    );
  const { marked } = await import("marked");
  const html = marked.parse(revision.article.replace(/</g, "&lt;"));
  p.publications.wordpress = {
    status: "sending",
    revision: revision.id,
    remoteId: previous?.remoteId,
    destination: url,
  };
  w.save();
  try {
    const post = await request(
      url +
        "/wp-json/wp/v2/posts" +
        (previous?.remoteId ? "/" + previous.remoteId : ""),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Basic " +
            Buffer.from(s.wordpressUser + ":" + w.secrets.wordpress).toString(
              "base64",
            ),
        },
        body: JSON.stringify({
          title: p.title,
          content: html,
          status: "publish",
        }),
      },
    );
    if (!post.id) throw Error("Resposta sem identificador remoto.");
    p.publications.wordpress = {
      status: "published",
      revision: revision.id,
      remoteId: post.id,
      destination: url,
      url: post.link,
      at: new Date().toISOString(),
    };
    w.save();
    return p.publications.wordpress;
  } catch (e) {
    p.publications.wordpress.status = "uncertain";
    w.save();
    throw Error(
      "Resultado da publicação incerto. Verifique o WordPress; a repetição automática foi bloqueada.",
    );
  }
}
async function instagram(w, id, urls) {
  const p = w.project(id),
    s = w.state.settings;
  assertApproved(p, s, "instagram");
  if (s.demo) throw Error("Desative a demonstração antes de publicar.");
  const r = current(p);
  if (r.demo)
    throw Error(
      "Material de demonstração não pode ser publicado. Gere uma nova revisão no modo conectado.",
    );
  if (p.publications.instagram)
    throw Error(
      "Já existe uma tentativa para este projeto. Confira a conta; este alfa não repete publicações Instagram.",
    );
  if (
    !/^v\d+\.\d+$/.test(s.graphVersion) ||
    !/^\d+$/.test(s.instagramAccount) ||
    !w.secrets?.instagram
  )
    throw Error(
      "Configure a conta profissional, a versão Graph e o token Instagram.",
    );
  if (
    !Array.isArray(urls) ||
    urls.length !== r.cards.length ||
    urls.length < 2 ||
    urls.length > 10
  )
    throw Error("Informe uma URL pública JPEG por card, na mesma ordem.");
  urls.forEach(httpsBase);
  const sharp = require("sharp");
  const { svgCard } = require("./render.cjs");
  for (let i = 0; i < urls.length; i++) {
    const response = await fetch(urls[i], {
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw Error(`Não foi possível verificar o JPEG do card ${i + 1}.`);
    const remote = Buffer.from(await response.arrayBuffer());
    const expected = await sharp(
      Buffer.from(svgCard(r.cards[i], i, r.cards.length)),
    )
      .jpeg({ quality: 95 })
      .toBuffer();
    if (!remote.equals(expected))
      throw Error(
        `O JPEG público do card ${i + 1} difere da revisão aprovada. Hospede o arquivo exportado sem conversão.`,
      );
  }
  const base = `https://graph.instagram.com/${s.graphVersion}/${s.instagramAccount}`;
  const headers = {
    Authorization: "Bearer " + w.secrets.instagram,
    "Content-Type": "application/json",
  };
  p.publications.instagram = {
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
    w.save();
    return p.publications.instagram;
  } catch (e) {
    p.publications.instagram.status = "uncertain";
    w.save();
    throw Error(
      "Tentativa Instagram não confirmada. Verifique a conta e os contêineres; repetição bloqueada.",
    );
  }
}
module.exports = { wordpress, instagram, httpsBase };
