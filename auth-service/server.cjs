// Deploy separately from the portable application, behind HTTPS.
const http = require("node:http");
const crypto = require("node:crypto");
const { scopes, hash, serviceURL } = require("../core/instagram-auth.cjs");
const { request } = require("../core/providers.cjs");
function createService({ origin, appId, appSecret, exchange, now = Date.now }) {
  origin = serviceURL(origin);
  if (!/^\d+$/.test(appId) || !appSecret)
    throw Error("Configure o aplicativo Instagram no servidor.");
  const sessions = new Map();
  const callback = origin + "/oauth/callback";
  exchange ||= async (code) => {
    const response = await request(
      "https://api.instagram.com/oauth/access_token",
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: callback,
          code,
        }),
      },
    );
    const short = response.data?.[0] || response;
    const granted = Array.isArray(short.permissions)
      ? short.permissions
      : String(short.permissions || "").split(",");
    if (!short.access_token || !scopes.every((s) => granted.includes(s)))
      throw Error("Permissões incompletas.");
    const long = await request(
      "https://graph.instagram.com/access_token?" +
        new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: short.access_token,
        }),
    );
    if (
      !long.access_token ||
      !Number.isFinite(long.expires_in) ||
      long.expires_in <= 0
    )
      throw Error("Token inválido.");
    return {
      token: long.access_token,
      expiresAt: now() + long.expires_in * 1000,
    };
  };
  const sweep = () => {
    for (const [id, s] of sessions)
      if (s.deadline <= now()) sessions.delete(id);
  };
  const timer = setInterval(sweep, 30000);
  timer.unref();
  const server = http.createServer(async (req, res) => {
    const send = (status, body, html = false) => {
      res.writeHead(status, {
        "Content-Type": html ? "text/html; charset=utf-8" : "application/json",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(
        html
          ? '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Conexão Instagram</title><h1>' +
              body +
              "</h1><p>Volte ao Social Media Agent.</p></html>"
          : JSON.stringify(body),
      );
    };
    try {
      sweep();
      const url = new URL(req.url, origin);
      if (req.method === "POST" && url.pathname === "/sessions") {
        if (sessions.size >= 1000)
          return send(429, { error: "Tente mais tarde." });
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > 1024)
            return send(413, { error: "Requisição extensa." });
        }
        const { challenge } = JSON.parse(raw);
        if (!/^[\w-]{43}$/.test(challenge))
          return send(400, { error: "Desafio inválido." });
        const id = crypto.randomBytes(32).toString("base64url");
        sessions.set(id, {
          challenge,
          deadline: now() + 600000,
          status: "pending",
        });
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: callback,
          response_type: "code",
          scope: scopes.join(","),
          state: id,
          enable_fb_login: "false",
        });
        return send(201, {
          id,
          url: "https://www.instagram.com/oauth/authorize?" + params,
        });
      }
      if (req.method === "GET" && url.pathname === "/oauth/callback") {
        const s = sessions.get(url.searchParams.get("state"));
        if (!s || s.status !== "pending")
          return send(400, "Esta conexão expirou ou já foi utilizada.", true);
        s.status = "exchanging";
        try {
          const code = url.searchParams.get("code");
          if (url.searchParams.has("error") || !code || code.length > 4096)
            throw Error("Autorização negada.");
          s.result = await exchange(code);
          s.status = "ready";
          return send(200, "Autorização recebida.", true);
        } catch {
          s.status = "failed";
          return send(400, "Não foi possível concluir a autorização.", true);
        }
      }
      const match = /^\/sessions\/([\w-]{43})$/.exec(url.pathname);
      if (match && ["GET", "DELETE"].includes(req.method)) {
        const s = sessions.get(match[1]);
        const bearer =
          req.headers.authorization?.match(/^Bearer ([\w-]{43})$/)?.[1];
        if (!s || !bearer || hash(bearer) !== s.challenge)
          return send(404, { error: "Sessão indisponível." });
        if (req.method === "DELETE") {
          sessions.delete(match[1]);
          return send(200, { status: "cancelled" });
        }
        if (s.status === "ready") {
          sessions.delete(match[1]);
          return send(200, { status: "ready", ...s.result });
        }
        return send(200, { status: s.status });
      }
      send(404, { error: "Rota inexistente." });
    } catch {
      send(400, { error: "Não foi possível processar a conexão." });
    }
  });
  server.on("close", () => {
    clearInterval(timer);
    sessions.clear();
  });
  server.requestTimeout = 15000;
  return server;
}
if (require.main === module)
  createService({
    origin: process.env.AUTH_ORIGIN,
    appId: process.env.INSTAGRAM_APP_ID,
    appSecret: process.env.INSTAGRAM_APP_SECRET,
  }).listen(
    Number(process.env.PORT || 8787),
    process.env.AUTH_BIND || "127.0.0.1",
  );
module.exports = { createService };
