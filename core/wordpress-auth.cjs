const { request } = require("./providers.cjs");
async function profile(token, siteId, siteUrl) {
  if (!/^\d+$/.test(siteId) || siteId === "0")
    throw Error("Selecione um site WordPress.com.");
  const url = new URL(siteUrl);
  if (url.protocol === "http:") url.protocol = "https:";
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error("Endereço do site inválido.");
  const clientId = require("./auth-config.json").wordpressClientId;
  const info = await request(
    "https://public-api.wordpress.com/oauth2/token-info?" +
      new URLSearchParams({ client_id: clientId, token }),
  );
  if (
    String(info.blog_id) !== siteId ||
    !["posts", "media"].every((scope) =>
      String(info.scope).split(/[ ,]+/).includes(scope),
    )
  )
    throw Error("O token não confirmou este site e suas permissões.");
  await request(
    `https://public-api.wordpress.com/rest/v1.1/sites/${siteId}/posts/?status=draft&number=1&fields=found`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return {
    siteId,
    siteUrl: url.href.replace(/\/$/, ""),
    siteName: url.hostname,
  };
}
module.exports = { profile };
