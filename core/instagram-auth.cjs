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
async function profile(token, version = "v23.0", signal) {
  if (!/^v\d+\.\d+$/.test(version)) throw Error("Versão da API inválida.");
  const data = await request(
    `https://graph.instagram.com/${version}/me?fields=user_id,username`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (
    !/^\d+$/.test(String(data.user_id)) ||
    typeof data.username !== "string" ||
    !data.username
  )
    throw Error("A Meta não confirmou a conta profissional.");
  return { id: String(data.user_id), username: data.username };
}
async function connect({
  service,
  openBrowser,
  signal,
  provider = "instagram",
}) {
  if (!["instagram", "wordpress", "blogger"].includes(provider))
    throw Error("Provedor inválido.");
  const base =
      serviceURL(service) + (provider === "instagram" ? "" : "/" + provider),
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
  const valid =
    provider === "blogger"
      ? url.origin === "https://accounts.google.com" &&
        url.pathname === "/o/oauth2/v2/auth" &&
        url.searchParams.get("scope") ===
          "https://www.googleapis.com/auth/blogger"
      : provider === "wordpress"
        ? url.origin === "https://public-api.wordpress.com" &&
          url.pathname === "/oauth2/authorize" &&
          url.searchParams.get("scope") === "posts media"
        : url.origin === "https://www.instagram.com" &&
          url.pathname === "/oauth/authorize" &&
          url.searchParams.get("scope") === scopes.join(",");
  if (!valid) throw Error("Autorização inesperada do serviço de conexão.");
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
          "A conexão não foi concluída. Etapa: " +
            ([
              "authorization",
              "short_token",
              "permissions",
              "long_token",
              "wordpress_token",
              "blogger_token",
            ].includes(result.failureStage)
              ? result.failureStage
              : "autorização") +
            ". Diagnóstico: " +
            ([
              "client_secret",
              "redirect_uri",
              "authorization_code",
              "client_id",
              "external_api",
              "network_or_response",
              "redirect_blocked",
              "timeout",
              "runtime_api",
              "network",
              "response_format",
            ].includes(result.diagnostic?.category)
              ? result.diagnostic.category
              : "indisponível") +
            ". Tente conectar novamente.",
        );
      if (result.status === "ready") {
        if (provider === "blogger") {
          if (
            typeof result.token !== "string" ||
            typeof result.refreshToken !== "string" ||
            !Number.isFinite(result.expiresAt) ||
            result.expiresAt <= Date.now()
          )
            throw Error("Credencial Blogger inválida.");
          return {
            token: result.token,
            refreshToken: result.refreshToken,
            expiresAt: result.expiresAt,
          };
        }
        if (provider === "wordpress") {
          if (typeof result.token !== "string")
            throw Error("Credencial inválida.");
          const site = await require("./wordpress-auth.cjs").profile(
            result.token,
            result.siteId,
            result.siteUrl,
            signal,
          );
          signal?.throwIfAborted();
          return { ...site, token: result.token };
        }
        if (
          typeof result.token !== "string" ||
          !Number.isFinite(result.expiresAt) ||
          result.expiresAt <= Date.now()
        )
          throw Error("Credencial inválida.");
        const account = await profile(result.token, "v23.0", signal);
        signal?.throwIfAborted();
        if (result.accountId && !/^\d+$/.test(String(result.accountId)))
          throw Error("O identificador retornado pelo serviço é inválido.");
        return {
          ...account,
          token: result.token,
          expiresAt: result.expiresAt,
          ...(typeof result.mediaToken === "string" &&
          result.mediaToken.length >= 40
            ? { mediaToken: result.mediaToken }
            : {}),
        };
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
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  }
}
module.exports = { connect, profile, scopes, hash, serviceURL };
