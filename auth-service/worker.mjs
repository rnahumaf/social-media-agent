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
  const r = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw Error("Meta rejeitou a solicitação.");
  return r.json();
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
    try {
      if (req.method === "GET" && url.pathname === "/health")
        return reply({
          status: "ok",
          instagramConfigured: !!this.env.INSTAGRAM_APP_SECRET,
        });
      if (req.method === "POST" && url.pathname === "/sessions") {
        if (!this.env.INSTAGRAM_APP_SECRET)
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
          deadline: now + 600000,
          status: "pending",
        });
        return reply(
          {
            id,
            url:
              "https://www.instagram.com/oauth/authorize?" +
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
      if (req.method === "GET" && url.pathname === "/oauth/callback") {
        const s = this.sessions.get(url.searchParams.get("state"));
        if (!s || s.status !== "pending")
          return reply("Esta conexão expirou ou já foi utilizada.", 400, true);
        s.status = "exchanging";
        try {
          const code = url.searchParams.get("code");
          if (url.searchParams.has("error") || !code || code.length > 4096)
            throw Error("Negado");
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
          const permissions = Array.isArray(short.permissions)
            ? short.permissions
            : String(short.permissions || "").split(",");
          if (
            !short.access_token ||
            !scopes.split(",").every((p) => permissions.includes(p))
          )
            throw Error("Permissões incompletas");
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
        } catch {
          s.status = "failed";
          return reply("Não foi possível concluir a autorização.", 400, true);
        }
      }
      const match = /^\/sessions\/([\w-]{43})$/.exec(url.pathname);
      if (match && ["GET", "DELETE"].includes(req.method)) {
        const s = this.sessions.get(match[1]),
          verifier = req.headers
            .get("Authorization")
            ?.match(/^Bearer ([\w-]{43})$/)?.[1];
        if (!s || !verifier || (await hash(verifier)) !== s.challenge)
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
        return reply({ status: s.status });
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
