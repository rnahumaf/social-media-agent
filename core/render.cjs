const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
function wrap(text, width) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > width) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += width)
        lines.push(word.slice(i, i + width));
    } else if ((line + " " + word).trim().length > width) {
      lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}
const layouts = [
  {
    titleSize: 62,
    titleWidth: 24,
    titleLineHeight: 76,
    bodySize: 36,
    bodyWidth: 39,
    bodyLineHeight: 50,
  },
  {
    titleSize: 58,
    titleWidth: 26,
    titleLineHeight: 70,
    bodySize: 34,
    bodyWidth: 42,
    bodyLineHeight: 47,
  },
  {
    titleSize: 54,
    titleWidth: 28,
    titleLineHeight: 65,
    bodySize: 32,
    bodyWidth: 45,
    bodyLineHeight: 44,
  },
  {
    titleSize: 50,
    titleWidth: 30,
    titleLineHeight: 60,
    bodySize: 30,
    bodyWidth: 48,
    bodyLineHeight: 41,
  },
];
function cardLayout(card, style) {
  if (
    !card ||
    typeof card.title !== "string" ||
    typeof card.body !== "string" ||
    (!card.title.trim() && !card.body.trim() && !card.image) ||
    card.title.length > 90 ||
    card.body.length > 420
  )
    throw Error(
      "O card precisa ter título de até 90 caracteres e texto de até 420 caracteres.",
    );
  const scale = style?.fontScale ?? 1;
  for (const base of layouts) {
    const layout = {
      titleSize: Math.round(base.titleSize * scale),
      titleWidth: Math.max(1, Math.floor(base.titleWidth / scale)),
      titleLineHeight: Math.round(base.titleLineHeight * scale),
      bodySize: Math.round(base.bodySize * scale),
      bodyWidth: Math.max(1, Math.floor(base.bodyWidth / scale)),
      bodyLineHeight: Math.round(base.bodyLineHeight * scale),
    };
    const title = wrap(card.title, layout.titleWidth);
    const body = wrap(card.body, layout.bodyWidth);
    const bodyY =
      (style?.layout === "split" && card.image ? 710 : 335) +
      title.length * layout.titleLineHeight;
    const bottom = bodyY + (body.length - 1) * layout.bodyLineHeight;
    if (title.length <= 5 && body.length <= 13 && bottom <= 1160)
      return { ...layout, title, body, bodyY };
  }
  throw Error(
    "O texto não cabe no card com tamanho legível. Divida o conteúdo em mais cards.",
  );
}
function svgCard(card, index, total, style, dir) {
  const {
    defaultStyle,
    styleSchema,
    imageSchema,
  } = require("./editorial-model.cjs");
  const s = styleSchema.parse(style || defaultStyle);
  const layout = cardLayout(card, s);
  const { title, body } = layout;
  let photo = "";
  if (card.image) {
    const im = imageSchema.parse(card.image);
    const bytes = require("./assets.cjs").readImage(dir, im);
    if (s.layout !== "text") {
      const y = s.layout === "split" ? 210 : 0,
        h = s.layout === "split" ? 400 : 1350;
      const pngWidth = bytes.readUInt32BE(16),
        pngHeight = bytes.readUInt32BE(20);
      const scale = Math.max(1080 / pngWidth, h / pngHeight) * im.zoom;
      const w = pngWidth * scale,
        ih = pngHeight * scale;
      photo = `<defs><clipPath id="photo"><rect width="1080" height="${h}" y="${y}"/></clipPath></defs><image href="data:image/png;base64,${bytes.toString("base64")}" x="${((1080 - w) * im.x) / 100}" y="${y + ((h - ih) * im.y) / 100}" width="${w}" height="${ih}" clip-path="url(#photo)"/>`;
      if (s.layout === "background")
        photo += `<rect width="1080" height="1350" fill="${s.background}" opacity="0.78"/>`;
    }
  }
  const font = s.font === "serif" ? "Georgia" : "Arial";
  const titleY = s.layout === "split" && card.image ? 670 : 295;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${s.background}"/>${photo}<rect x="80" y="96" width="64" height="8" fill="${s.accent}"/><text x="80" y="164" font-family="${font}" font-size="24" fill="${s.textColor}">${escape(s.signature)}</text><g font-family="${font}" fill="${s.titleColor}" font-weight="bold" font-size="${layout.titleSize}">${title.map((line, i) => `<text x="80" y="${titleY + i * layout.titleLineHeight}">${escape(line)}</text>`).join("")}</g><g font-family="${font}" font-size="${layout.bodySize}" fill="${s.textColor}">${body.map((line, i) => `<text x="80" y="${layout.bodyY + i * layout.bodyLineHeight}">${escape(line)}</text>`).join("")}</g><line x1="80" x2="1000" y1="1220" y2="1220" stroke="${s.accent}"/><text x="80" y="1272" font-family="${font}" font-size="24" fill="${s.textColor}">${index + 1} / ${total}</text></svg>`;
}
// Cache the exact SVG, including validated image bytes and card position.
// Validation happens before cache lookup, preserving P0 approval checks.
const { createRenderCache, digest } = require("./render-cache.cjs");
const renderCache = createRenderCache();
async function renderCard(dir, card, index, total, style) {
  const svg = svgCard(card, index, total, style, dir);
  const key = digest(require("node:path").resolve(dir) + "\n" + svg);
  return renderCache.get(key, () =>
    require("sharp")(Buffer.from(svg)).jpeg({ quality: 95 }).toBuffer(),
  );
}
async function renderJPEGs(dir, cards, style) {
  if (!Array.isArray(cards) || cards.length > 10)
    throw Error("Cards inválidos.");
  return Promise.all(
    cards.map((card, index) =>
      renderCard(dir, card, index, cards.length, style),
    ),
  );
}
async function previewCards(dir, cards, style) {
  if (!Array.isArray(cards) || cards.length > 10)
    throw Error("Cards inválidos.");
  return Promise.all(
    cards.map(async (card, index) => {
      try {
        const shown =
          !card.title?.trim() && !card.body?.trim() && !card.image
            ? {
                ...card,
                title: "Seu próximo card",
                body: "Escreva o texto ou adicione uma imagem.",
              }
            : card;
        const image = await renderCard(dir, shown, index, cards.length, style);
        return {
          image: "data:image/jpeg;base64," + image.toString("base64"),
          ...(shown !== card ? { incomplete: true } : {}),
        };
      } catch (error) {
        return { error: error.message };
      }
    }),
  );
}
module.exports = {
  svgCard,
  wrap,
  cardLayout,
  renderJPEGs,
  renderCard,
  previewCards,
};
