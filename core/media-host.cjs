const { request } = require("./providers.cjs");
const { serviceURL } = require("./instagram-auth.cjs");

function mediaURL(service, value) {
  const base = serviceURL(service);
  const url = new URL(value);
  if (
    url.origin !== base ||
    !/^\/media\/\d+\/[\w-]{43}\.jpg$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error("O serviço retornou um endereço de imagem inválido.");
  return url.href;
}

async function upload(service, token, image) {
  if (typeof token !== "string" || token.length < 40)
    throw Error(
      "Reconecte o Instagram para habilitar a hospedagem temporária dos cards.",
    );
  if (!Buffer.isBuffer(image) || image.length < 4 || image.length > 4_000_000)
    throw Error("O card JPEG excede o limite da hospedagem temporária.");
  const result = await request(serviceURL(service) + "/media", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "image/jpeg",
    },
    body: image,
  });
  return { id: result.id, url: mediaURL(service, result.url) };
}

async function remove(service, token, item) {
  const url = mediaURL(service, item.url);
  await request(url, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
}

module.exports = { upload, remove, mediaURL };
