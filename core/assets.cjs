const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { imageSchema } = require("./editorial-model.cjs");
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
async function importImage(dir, filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024)
    throw Error("Escolha uma imagem JPEG, PNG ou WebP de até 20 MB.");
  const sharp = require("sharp");
  const input = sharp(fs.readFileSync(filename), {
    limitInputPixels: 40_000_000,
  });
  const meta = await input.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format) || (meta.pages || 1) > 1)
    throw Error("Use uma imagem estática JPEG, PNG ou WebP.");
  // Normalização remove metadados e mantém apenas os pixels usados pelo editor.
  const bytes = await input
    .rotate()
    .resize({
      width: 2160,
      height: 2700,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const digest = hash(bytes);
  const relative = `assets/${digest}.png`;
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  try {
    fs.writeFileSync(path.join(dir, relative), bytes, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const image = { path: relative, hash: digest, x: 50, y: 50, zoom: 1 };
  readImage(dir, image);
  return image;
}
function readImage(dir, value) {
  const image = imageSchema.parse(value);
  if (!dir || image.path !== `assets/${image.hash}.png`)
    throw Error("Referência de imagem inválida.");
  const file = path.join(dir, image.path);
  const real = fs.realpathSync(file);
  const root = fs.realpathSync(dir) + path.sep;
  if (!real.startsWith(root) || fs.statSync(real).size > 40 * 1024 * 1024)
    throw Error("Imagem fora do workspace ou muito grande.");
  const bytes = fs.readFileSync(real);
  if (hash(bytes) !== image.hash)
    throw Error(
      "A imagem foi alterada fora do aplicativo. Importe-a novamente e aprove uma nova revisão.",
    );
  return bytes;
}
module.exports = { importImage, readImage, hash };
