const crypto = require("node:crypto");
const { request } = require("./providers.cjs");
const scopes = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("base64url");
function serviceURL(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("Serviço de conexão precisa de uma origem HTTPS.");
  return u.origin;
}
async function profile(token, version = "v23.0") {
  if (!/^v\d+\.\d+$/.test(version)) throw Error("Versão da API inválida.");
  const data = await request(
    `https://graph.instagram.com/${version}/me?fields=user_id,username`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (
    !/^\d+$/.test(String(data.user_id)) ||
    typeof data.username !== "string" ||
    !data.username
  )
    throw Error("A Meta não confirmou a conta profissional.");
  return { id: String(data.user_id), username: data.username };
}
async function connect({ service, openBrowser, signal }) {
  const base = serviceURL(service),
    verifier = crypto.randomBytes(32).toString("base64url");
  const session = await request(base + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: hash(verifier) }),
    signal,
  });
  if (!/^[\w-]{32,128}$/.test(session.id))
    throw Error("Sessão de conexão inválida.");
  const url = new URL(session.url);
  if (
    url.origin !== "https://www.instagram.com" ||
    url.pathname !== "/oauth/authorize" ||
    url.searchParams.get("scope") !== scopes.join(",")
  )
    throw Error("Autorização inesperada do serviço de conexão.");
  try {
    await openBrowser(url.href);
    const until = Date.now() + 10 * 60 * 1000;
    while (Date.now() < until) {
      signal?.throwIfAborted();
      const result = await request(base + "/sessions/" + session.id, {
        headers: { Authorization: `Bearer ${verifier}` },
        signal,
      });
      if (result.status === "failed")
        throw Error(
          "A conexão não foi autorizada ou expirou. Tente conectar novamente.",
        );
      if (result.status === "ready") {
        if (
          typeof result.token !== "string" ||
          !Number.isFinite(result.expiresAt) ||
          result.expiresAt <= Date.now()
        )
          throw Error("Credencial inválida.");
        const account = await profile(result.token);
        return { ...account, token: result.token, expiresAt: result.expiresAt };
      }
      await new Promise((resolve, reject) => {
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          done();
          reject(Error("Conexão cancelada."));
        };
        const timer = setTimeout(done, 2000);
        signal?.addEventListener("abort", abort, { once: true });
      });
    }
    throw Error("O prazo de conexão terminou. Tente novamente.");
  } finally {
    await request(base + "/sessions/" + session.id, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${verifier}` },
    }).catch(() => {});
  }
}
module.exports = { connect, profile, scopes, hash, serviceURL };
