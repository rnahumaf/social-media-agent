const scopes = "instagram_business_basic,instagram_business_content_publish";
const random = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const hash = async (value) =>
  btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const reply = (body, status = 200, html = false) =>
  new Response(
    html
      ? `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Instagram</title><h1>${body}</h1><p>Volte ao Social Media Agent.</p></html>`
      : JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type": html ? "text/html; charset=utf-8" : "application/json",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
async function json(url, options = {}) {
  let r;
  try {
    r = await fetch(url, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  } catch (cause) {
    const error = Error("Falha de transporte.");
    error.diagnostic = {
      category: /redirect/i.test(cause.message)
        ? "redirect_blocked"
        : /timeout|abort/i.test(cause.message)
          ? "timeout"
          : /not a function|AbortSignal/i.test(cause.message)
            ? "runtime_api"
            : "network",
    };
    throw error;
  }
  if (!r.ok) {
    const payload = await r.json().catch(() => ({}));
    const message = String(
      payload.error?.message || payload.error_message || "",
    );
    const category = /secret/i.test(message)
      ? "client_secret"
      : /redirect/i.test(message)
        ? "redirect_uri"
        : /code/i.test(message)
          ? "authorization_code"
          : /app|client/i.test(message)
            ? "client_id"
            : "external_api";
    const error = Error("Meta rejeitou a solicitação.");
    error.diagnostic = { http: r.status, category };
    throw error;
  }
  try {
    return await r.json();
  } catch {
    const error = Error("Resposta não JSON.");
    error.diagnostic = { http: r.status, category: "response_format" };
    throw error;
  }
}
export class AuthSessions {
  constructor(ctx, env) {
    this.env = env;
    this.sessions = new Map();
    this.rates = new Map();
  }
  async fetch(req) {
    const now = Date.now(),
      url = new URL(req.url),
      origin = url.origin;
    for (const [k, s] of this.sessions)
      if (s.deadline <= now) this.sessions.delete(k);
    for (const [k, s] of this.rates)
      if (s.deadline <= now) this.rates.delete(k);
    const wordpress = url.pathname.startsWith("/wordpress/");
    const route = wordpress ? url.pathname.slice(10) : url.pathname;
    const provider = wordpress ? "wordpress" : "instagram";
    try {
      if (req.method === "GET" && url.pathname === "/")
        return reply(
          "Social Media Agent — alfa. Estúdio editorial local com aprovação humana. Conecte sua conta no aplicativo desktop; cada publicação exige aprovação.",
          200,
          true,
        );
      if (req.method === "GET" && url.pathname === "/health")
        return reply({
          status: "ok",
          instagramConfigured: !!this.env.INSTAGRAM_APP_SECRET,
          wordpressConfigured: !!this.env.WORDPRESS_CLIENT_SECRET,
        });
      if (req.method === "POST" && route === "/sessions") {
        if (
          !(wordpress
            ? this.env.WORDPRESS_CLIENT_SECRET
            : this.env.INSTAGRAM_APP_SECRET)
        )
          return reply({ error: "Conexão em configuração." }, 503);
        const ip = await hash(req.headers.get("CF-Connecting-IP") || "unknown");
        const rate = this.rates.get(ip) || { count: 0, deadline: now + 60000 };
        rate.count++;
        this.rates.set(ip, rate);
        if (rate.count > 10 || this.sessions.size >= 1000)
          return reply({ error: "Tente mais tarde." }, 429);
        if (Number(req.headers.get("Content-Length")) > 1024)
          return reply({ error: "Corpo inválido." }, 413);
        const reader = req.body?.getReader();
        let raw = "",
          size = 0;
        if (!reader) return reply({ error: "Corpo ausente." }, 400);
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1024) {
            await reader.cancel();
            return reply({ error: "Corpo inválido." }, 413);
          }
          raw += new TextDecoder().decode(value);
        }
        const { challenge } = JSON.parse(raw);
        if (!/^[\w-]{43}$/.test(challenge))
          return reply({ error: "Desafio inválido." }, 400);
        const id = random();
        this.sessions.set(id, {
          challenge,
          provider,
          deadline: now + 600000,
          status: "pending",
        });
        return reply(
          {
            id,
            url: wordpress
              ? "https://public-api.wordpress.com/oauth2/authorize?" +
                new URLSearchParams({
                  client_id: this.env.WORDPRESS_CLIENT_ID,
                  redirect_uri: origin + "/wordpress/callback",
                  response_type: "code",
                  scope: "posts media",
                  state: id,
                })
              : "https://www.instagram.com/oauth/authorize?" +
                new URLSearchParams({
                  client_id: this.env.INSTAGRAM_APP_ID,
                  redirect_uri: origin + "/oauth/callback",
                  response_type: "code",
                  scope: scopes,
                  state: id,
                  enable_fb_login: "false",
                }),
          },
          201,
        );
      }
      if (
        req.method === "GET" &&
        (url.pathname === "/oauth/callback" ||
          url.pathname === "/wordpress/callback")
      ) {
        const s = this.sessions.get(url.searchParams.get("state"));
        if (!s || s.status !== "pending" || s.provider !== provider)
          return reply("Esta conexão expirou ou já foi utilizada.", 400, true);
        s.status = "exchanging";
        let stage = "authorization";
        try {
          const code = url.searchParams.get("code");
          if (url.searchParams.has("error") || !code || code.length > 4096)
            throw Error("Negado");
          if (wordpress) {
            stage = "wordpress_token";
            const token = await json(
              "https://public-api.wordpress.com/oauth2/token",
              {
                method: "POST",
                body: new URLSearchParams({
                  client_id: this.env.WORDPRESS_CLIENT_ID,
                  client_secret: this.env.WORDPRESS_CLIENT_SECRET,
                  grant_type: "authorization_code",
                  redirect_uri: origin + "/wordpress/callback",
                  code,
                }),
              },
            );
            if (
              !token.access_token ||
              !/^\d+$/.test(String(token.blog_id)) ||
              String(token.blog_id) === "0"
            )
              throw Error("Site não confirmado.");
            const granted = String(token.scope || "").split(/[ ,]+/);
            if (!["posts", "media"].every((p) => granted.includes(p)))
              throw Error("Permissões incompletas.");
            s.result = {
              token: token.access_token,
              siteId: String(token.blog_id),
              siteUrl: token.blog_url,
            };
            s.status = "ready";
            return reply("WordPress.com autorizado.", 200, true);
          }
          stage = "short_token";
          const response = await json(
            "https://api.instagram.com/oauth/access_token",
            {
              method: "POST",
              body: new URLSearchParams({
                client_id: this.env.INSTAGRAM_APP_ID,
                client_secret: this.env.INSTAGRAM_APP_SECRET,
                grant_type: "authorization_code",
                redirect_uri: origin + "/oauth/callback",
                code,
              }),
            },
          );
          const short = response.data?.[0] || response;
          stage = "permissions";
          const permissions = Array.isArray(short.permissions)
            ? short.permissions
            : String(short.permissions || "").split(",");
          if (
            !short.access_token ||
            !scopes.split(",").every((p) => permissions.includes(p))
          )
            throw Error("Permissões incompletas");
          stage = "long_token";
          const long = await json(
            "https://graph.instagram.com/access_token?" +
              new URLSearchParams({
                grant_type: "ig_exchange_token",
                client_secret: this.env.INSTAGRAM_APP_SECRET,
                access_token: short.access_token,
              }),
          );
          if (
            !long.access_token ||
            !Number.isFinite(long.expires_in) ||
            long.expires_in <= 0
          )
            throw Error("Token inválido");
          s.result = {
            token: long.access_token,
            expiresAt: Date.now() + long.expires_in * 1000,
          };
          s.status = "ready";
          return reply("Autorização recebida.", 200, true);
        } catch (error) {
          s.status = "failed";
          s.diagnostic = error.diagnostic || {
            category: "network_or_response",
          };
          s.failureStage = stage;
          return reply("Não foi possível concluir a autorização.", 400, true);
        }
      }
      const match = /^\/sessions\/([\w-]{43})$/.exec(route);
      if (match && ["GET", "DELETE"].includes(req.method)) {
        const s = this.sessions.get(match[1]),
          verifier = req.headers
            .get("Authorization")
            ?.match(/^Bearer ([\w-]{43})$/)?.[1];
        if (
          !s ||
          s.provider !== provider ||
          !verifier ||
          (await hash(verifier)) !== s.challenge
        )
          return reply({ error: "Sessão indisponível." }, 404);
        // Recheck after the asynchronous digest to prevent concurrent consumption.
        if (this.sessions.get(match[1]) !== s)
          return reply({ error: "Sessão indisponível." }, 404);
        if (req.method === "DELETE") {
          this.sessions.delete(match[1]);
          return reply({ status: "cancelled" });
        }
        if (s.status === "ready") {
          this.sessions.delete(match[1]);
          return reply({ status: "ready", ...s.result });
        }
        return reply({
          status: s.status,
          failureStage: s.failureStage,
          diagnostic: s.diagnostic,
        });
      }
      return reply({ error: "Rota inexistente." }, 404);
    } catch {
      return reply({ error: "Conexão não concluída." }, 400);
    }
  }
}
export default {
  fetch(req, env) {
    return env.AUTH_SESSIONS.get(env.AUTH_SESSIONS.idFromName("alpha")).fetch(
      req,
    );
  },
};
