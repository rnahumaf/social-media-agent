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
const encode = (value) =>
  btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const decode = (value) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(
    atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
};
async function mediaSignature(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return encode(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    ),
  );
}
export async function createMediaToken(secret, accountId, expiresAt) {
  const payload = encode(
    new TextEncoder().encode(
      JSON.stringify({ accountId, expiresAt, nonce: random() }),
    ),
  );
  return payload + "." + (await mediaSignature(secret, payload));
}
async function verifyMediaToken(secret, token, now) {
  if (!secret || typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (extra || !payload || !signature) return null;
  const expected = await mediaSignature(secret, payload);
  if (signature.length !== expected.length) return null;
  let difference = 0;
  for (let index = 0; index < signature.length; index++)
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  if (difference) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (!/^\d+$/.test(data.accountId) || data.expiresAt <= now) return null;
    return data;
  } catch {
    return null;
  }
}
const reply = (body, status = 200, html = false) =>
  new Response(
    html
      ? `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Social Media Agent</title><h1>${body}</h1><p>Volte ao Social Media Agent.</p></html>`
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
const page = (title, body) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Social Media Agent</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#193d32;background:#f5f3ed;margin:0}main{max-width:760px;margin:auto;padding:48px 24px 80px}h1,h2{line-height:1.2}a{color:#226453}nav{display:flex;gap:18px;flex-wrap:wrap;margin:28px 0}small{color:#52625c}</style><main><h1>${title}</h1>${body}<nav><a href="/">Início</a><a href="/privacy">Privacidade</a><a href="/terms">Termos</a><a href="/data-deletion">Exclusão de dados</a></nav><small>Social Media Agent · contato: rnahumaf@gmail.com</small></main></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
const publicPages = {
  "/": () =>
    page(
      "Social Media Agent",
      '<p>Aplicativo desktop para pesquisa bibliográfica, redação, carrosséis e publicação com aprovação humana.</p><p>Cada pessoa conecta suas próprias contas no navegador e guarda as autorizações no cofre criptografado do seu workspace local.</p><p><a href="https://github.com/rnahumaf/social-media-agent">Código-fonte e instruções no GitHub</a></p>',
    ),
  "/privacy": () =>
    page(
      "Política de privacidade",
      `<p>Última atualização: 13 de setembro de 2026.</p>
      <h2>Dados tratados</h2><p>O aplicativo trata o identificador e o nome público das contas conectadas, a lista de blogs ou sites autorizados, tokens OAuth e o conteúdo que você decidir publicar. Projetos editoriais, conversas, fontes e credenciais permanecem no workspace escolhido por você. As credenciais são cifradas no cofre local.</p>
      <h2>Finalidade</h2><p>Esses dados são usados para confirmar a conta escolhida, listar destinos disponíveis e executar publicações aprovadas por você. O aplicativo não vende dados pessoais nem usa o conteúdo conectado para publicidade.</p>
      <h2>Serviço de conexão</h2><p>O serviço hospedado no Cloudflare troca códigos OAuth com Instagram, Google e WordPress.com. Códigos e tokens passam pelo serviço durante a conexão, mas não são gravados em banco ou logs de conteúdo. Imagens destinadas ao Instagram ficam temporariamente no Cloudflare R2 até o processamento da publicação; o aplicativo solicita sua remoção ao concluir e uma regra elimina remanescentes em até um dia.</p>
      <h2>Outros serviços</h2><p>Quando você ativa uma função, dados necessários podem ser enviados ao OpenRouter, PubMed/NCBI, Meta/Instagram, Google/Blogger ou WordPress. Cada provedor aplica seus próprios termos e política de privacidade.</p>
      <h2>Retenção e controle</h2><p>Você controla os arquivos do workspace. Use Desconectar para remover uma autorização do cofre atual, revogue o aplicativo na conta do provedor para invalidar outras cópias e apague o workspace para eliminar os dados locais. Consulte a página de exclusão para as etapas completas.</p>
      <h2>Contato</h2><p>Dúvidas ou pedidos relacionados à privacidade podem ser enviados para <a href="mailto:rnahumaf@gmail.com">rnahumaf@gmail.com</a>.</p>`,
    ),
  "/terms": () =>
    page(
      "Termos de uso",
      `<p>Última atualização: 13 de setembro de 2026.</p>
      <h2>Uso do aplicativo</h2><p>O Social Media Agent é um software Beta de código aberto. Você deve usar contas que administra e revisar textos, imagens, referências e destinos antes de autorizar qualquer publicação.</p>
      <h2>Contas e custos</h2><p>Você fornece suas próprias contas e credenciais. Tarifas, limites e regras do OpenRouter, Instagram, Google, WordPress e outros serviços continuam sob responsabilidade de cada provedor e do titular da conta.</p>
      <h2>Conteúdo</h2><p>Você mantém seus direitos sobre o conteúdo inserido e produzido. Cabe a você verificar exatidão, direitos autorais, privacidade, consentimentos profissionais e adequação da publicação.</p>
      <h2>Disponibilidade</h2><p>Recursos Beta podem falhar ou mudar. O aplicativo preserva o histórico local e evita repetir automaticamente publicações com resultado incerto, mas não garante disponibilidade de serviços externos.</p>
      <h2>Contato</h2><p>Questões sobre estes termos podem ser enviadas para <a href="mailto:rnahumaf@gmail.com">rnahumaf@gmail.com</a>.</p>`,
    ),
  "/data-deletion": () =>
    page(
      "Exclusão de dados",
      `<p>O serviço de conexão não mantém uma conta central nem grava tokens OAuth em banco. Para remover seus dados e autorizações:</p><ol><li>No Social Media Agent, abra Modelos e conexões e use Desconectar para cada serviço.</li><li>Revogue o Social Media Agent nas configurações de aplicativos conectados do Instagram, Google ou WordPress.</li><li>Apague a pasta do workspace para eliminar projetos, histórico e o cofre local.</li><li>Use Bloquear e esquecer neste computador antes de apagar o workspace para remover a lembrança local da senha-mestra.</li></ol><p>JPEGs temporários enviados para publicação no Instagram são apagados ao final do fluxo e expiram em até um dia. Para ajuda, escreva para <a href="mailto:rnahumaf@gmail.com">rnahumaf@gmail.com</a>.</p>`,
    ),
};
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
    const blogger = url.pathname.startsWith("/blogger/");
    const route = wordpress
      ? url.pathname.slice(10)
      : blogger
        ? url.pathname.slice(8)
        : url.pathname;
    const provider = wordpress
      ? "wordpress"
      : blogger
        ? "blogger"
        : "instagram";
    try {
      if (req.method === "GET" && publicPages[url.pathname])
        return publicPages[url.pathname]();
      if (req.method === "GET" && url.pathname === "/health")
        return reply({
          status: "ok",
          instagramConfigured: !!this.env.INSTAGRAM_APP_SECRET,
          wordpressConfigured: !!this.env.WORDPRESS_CLIENT_SECRET,
          bloggerConfigured: !!this.env.GOOGLE_CLIENT_SECRET,
          mediaConfigured: !!this.env.MEDIA_SIGNING_SECRET && !!this.env.MEDIA,
        });
      const mediaMatch = /^\/media\/(\d+)\/([\w-]{43})\.jpg$/.exec(
        url.pathname,
      );
      if (req.method === "GET" && mediaMatch) {
        if (!this.env.MEDIA)
          return reply({ error: "Mídia indisponível." }, 503);
        const object = await this.env.MEDIA.get(
          `${mediaMatch[1]}/${mediaMatch[2]}.jpg`,
        );
        if (!object) return reply({ error: "Mídia inexistente." }, 404);
        return new Response(object.body, {
          headers: {
            "Content-Type": "image/jpeg",
            "Content-Length": String(object.size),
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (
        (req.method === "POST" && url.pathname === "/media") ||
        (req.method === "DELETE" && mediaMatch)
      ) {
        const token = req.headers
          .get("Authorization")
          ?.match(/^Bearer ([^\s]{40,4096})$/)?.[1];
        const credential = await verifyMediaToken(
          this.env.MEDIA_SIGNING_SECRET,
          token,
          now,
        );
        if (!credential || !this.env.MEDIA)
          return reply({ error: "Hospedagem não autorizada." }, 401);
        if (req.method === "DELETE") {
          if (mediaMatch[1] !== credential.accountId)
            return reply({ error: "Mídia inexistente." }, 404);
          await this.env.MEDIA.delete(`${mediaMatch[1]}/${mediaMatch[2]}.jpg`);
          return reply({ status: "removed" });
        }
        if (req.headers.get("Content-Type") !== "image/jpeg")
          return reply({ error: "Formato inválido." }, 415);
        const declared = Number(req.headers.get("Content-Length") || 0);
        if (declared > 4_000_000)
          return reply({ error: "Card muito grande." }, 413);
        const image = new Uint8Array(await req.arrayBuffer());
        if (
          image.length < 4 ||
          image.length > 4_000_000 ||
          image[0] !== 0xff ||
          image[1] !== 0xd8 ||
          image[2] !== 0xff
        )
          return reply({ error: "JPEG inválido." }, 400);
        const id = random();
        await this.env.MEDIA.put(`${credential.accountId}/${id}.jpg`, image, {
          httpMetadata: { contentType: "image/jpeg" },
        });
        return reply(
          {
            id,
            url: `${origin}/media/${credential.accountId}/${id}.jpg`,
          },
          201,
        );
      }
      if (req.method === "POST" && route === "/sessions") {
        if (
          !(wordpress
            ? this.env.WORDPRESS_CLIENT_SECRET
            : blogger
              ? this.env.GOOGLE_CLIENT_SECRET
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
            url: blogger
              ? "https://accounts.google.com/o/oauth2/v2/auth?" +
                new URLSearchParams({
                  client_id: this.env.GOOGLE_CLIENT_ID,
                  redirect_uri: origin + "/blogger/callback",
                  response_type: "code",
                  scope: "https://www.googleapis.com/auth/blogger",
                  access_type: "offline",
                  prompt: "consent select_account",
                  state: id,
                })
              : wordpress
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
          url.pathname === "/wordpress/callback" ||
          url.pathname === "/blogger/callback")
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
          if (blogger) {
            stage = "blogger_token";
            const token = await json("https://oauth2.googleapis.com/token", {
              method: "POST",
              body: new URLSearchParams({
                client_id: this.env.GOOGLE_CLIENT_ID,
                client_secret: this.env.GOOGLE_CLIENT_SECRET,
                grant_type: "authorization_code",
                redirect_uri: origin + "/blogger/callback",
                code,
              }),
            });
            if (
              !token.access_token ||
              !token.refresh_token ||
              !Number.isFinite(token.expires_in) ||
              token.expires_in <= 0 ||
              !String(token.scope)
                .split(" ")
                .includes("https://www.googleapis.com/auth/blogger")
            )
              throw Error("Permissões incompletas.");
            s.result = {
              token: token.access_token,
              refreshToken: token.refresh_token,
              expiresAt: Date.now() + token.expires_in * 1000,
            };
            s.status = "ready";
            return reply("Blogger autorizado.", 200, true);
          }
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
          const accountId = String(short.user_id || response.user_id || "");
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
            ...(/^\d+$/.test(accountId) ? { accountId } : {}),
            ...(this.env.MEDIA_SIGNING_SECRET && /^\d+$/.test(accountId)
              ? {
                  mediaToken: await createMediaToken(
                    this.env.MEDIA_SIGNING_SECRET,
                    accountId,
                    Date.now() +
                      Math.min(long.expires_in * 1000, 60 * 86400000),
                  ),
                }
              : {}),
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
      if (blogger && route === "/refresh" && req.method === "POST") {
        const refreshToken = req.headers
          .get("Authorization")
          ?.match(/^Bearer ([^\s]{20,4096})$/)?.[1];
        if (!refreshToken || !this.env.GOOGLE_CLIENT_SECRET)
          return reply({ error: "Reconecte o Blogger." }, 401);
        const ip = await hash(req.headers.get("CF-Connecting-IP") || "unknown");
        const rate = this.rates.get(ip) || { count: 0, deadline: now + 60000 };
        rate.count++;
        this.rates.set(ip, rate);
        if (rate.count > 10) return reply({ error: "Tente mais tarde." }, 429);
        const token = await json("https://oauth2.googleapis.com/token", {
          method: "POST",
          body: new URLSearchParams({
            client_id: this.env.GOOGLE_CLIENT_ID,
            client_secret: this.env.GOOGLE_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        });
        if (
          !token.access_token ||
          !Number.isFinite(token.expires_in) ||
          token.expires_in <= 0
        )
          return reply({ error: "Reconecte o Blogger." }, 401);
        return reply({
          token: token.access_token,
          expiresAt: Date.now() + token.expires_in * 1000,
        });
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
