const { request } = require("./providers.cjs");
const { serviceURL } = require("./instagram-auth.cjs");
const { assertApproved, current } = require("./workspace.cjs");
const base = "https://www.googleapis.com/blogger/v3";
function blogURL(value) {
  const u = new URL(value);
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw Error("Endereço Blogger inválido.");
  return u.href.replace(/\/$/, "");
}
async function blogs(token) {
  const data = await request(
    base + "/users/self/blogs?fields=items(id,name,url)",
    { headers: { Authorization: "Bearer " + token } },
  );
  return (data.items || []).map((b) => {
    if (!/^\d+$/.test(b.id) || typeof b.name !== "string")
      throw Error("Blog não confirmado pelo Google.");
    return { id: b.id, name: b.name, url: blogURL(b.url) };
  });
}
async function access(w, service) {
  if (!w.secrets?.blogger)
    throw Error("Desbloqueie o cofre e conecte o Blogger.");
  let credential;
  try {
    credential = JSON.parse(w.secrets.blogger);
  } catch {
    throw Error("Reconecte o Blogger.");
  }
  if (
    typeof credential.token !== "string" ||
    typeof credential.refreshToken !== "string" ||
    !Number.isFinite(credential.expiresAt)
  )
    throw Error("Reconecte o Blogger.");
  if (credential.expiresAt < Date.now() + 60000) {
    let refreshed;
    try {
      refreshed = await request(serviceURL(service) + "/blogger/refresh", {
        method: "POST",
        headers: { Authorization: "Bearer " + credential.refreshToken },
      });
    } catch {
      throw Error("Não foi possível renovar o acesso. Reconecte o Blogger.");
    }
    if (
      typeof refreshed.token !== "string" ||
      !Number.isFinite(refreshed.expiresAt) ||
      refreshed.expiresAt <= Date.now()
    )
      throw Error("Reconecte o Blogger.");
    credential = {
      ...credential,
      token: refreshed.token,
      expiresAt: refreshed.expiresAt,
    };
    w.storeSecret("blogger", JSON.stringify(credential));
  }
  return credential.token;
}
async function verify(w, service) {
  const token = await access(w, service),
    available = await blogs(token),
    s = w.state.settings;
  const blog = available.find(
    (b) => b.id === s.bloggerId && b.url === s.bloggerUrl,
  );
  if (!blog)
    throw Error(
      "O Google não confirmou acesso ao blog selecionado. Reconecte o Blogger.",
    );
  return { token, blog };
}
async function publish(w, id, service) {
  const p = w.project(id),
    s = w.state.settings,
    r = current(p);
  assertApproved(p, s, "blogger");
  if (s.demo || r.demo)
    throw Error("Gere uma revisão conectada antes de publicar.");
  const previous = p.publications.blogger;
  if (previous?.status === "uncertain" || previous?.status === "sending")
    throw Error(
      "Resultado anterior incerto. Confira o Blogger antes de repetir.",
    );
  if (previous?.destination && previous.destination !== s.bloggerId)
    throw Error("Este projeto pertence a outro blog. Crie uma nova pauta.");
  if (previous?.revision === r.id && previous.status === "published")
    return previous;
  if (previous?.remoteId && !/^\d+$/.test(previous.remoteId))
    throw Error("Identificador remoto inválido.");
  const { token } = await verify(w, service);
  const { marked } = await import("marked");
  const content = marked.parse(r.article.replace(/</g, "&lt;"));
  p.publications.blogger = {
    status: "sending",
    revision: r.id,
    destination: s.bloggerId,
    remoteId: previous?.remoteId,
  };
  w.save();
  try {
    const post = await request(
      base +
        "/blogs/" +
        s.bloggerId +
        "/posts" +
        (previous?.remoteId ? "/" + previous.remoteId : "?isDraft=false"),
      {
        method: previous?.remoteId ? "PUT" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ kind: "blogger#post", title: p.title, content }),
      },
    );
    if (
      !/^\d+$/.test(post.id) ||
      String(post.blog?.id) !== s.bloggerId ||
      post.status !== "LIVE"
    )
      throw Error("Publicação não confirmada.");
    p.publications.blogger = {
      status: "published",
      revision: r.id,
      destination: s.bloggerId,
      remoteId: post.id,
      url: post.url,
      at: new Date().toISOString(),
    };
    w.save();
    return p.publications.blogger;
  } catch {
    p.publications.blogger.status = "uncertain";
    w.save();
    throw Error(
      "Resultado Blogger incerto. Confira o blog; a repetição automática foi bloqueada.",
    );
  }
}
module.exports = { blogs, access, verify, publish, blogURL };
