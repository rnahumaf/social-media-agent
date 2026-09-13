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
function cardLayout(card) {
  if (
    !card ||
    typeof card.title !== "string" ||
    typeof card.body !== "string" ||
    !card.title.trim() ||
    !card.body.trim() ||
    card.title.length > 90 ||
    card.body.length > 420
  )
    throw Error(
      "O card precisa ter título de até 90 caracteres e texto de até 420 caracteres.",
    );
  for (const layout of layouts) {
    const title = wrap(card.title, layout.titleWidth);
    const body = wrap(card.body, layout.bodyWidth);
    const bodyY = 335 + title.length * layout.titleLineHeight;
    const bottom = bodyY + (body.length - 1) * layout.bodyLineHeight;
    if (title.length <= 5 && body.length <= 13 && bottom <= 1160)
      return { ...layout, title, body, bodyY };
  }
  throw Error(
    "O texto não cabe no card com tamanho legível. Divida o conteúdo em mais cards.",
  );
}
function svgCard(card, index, total) {
  const layout = cardLayout(card);
  const { title, body } = layout;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#f5f3ed"/><rect x="80" y="96" width="64" height="8" fill="#226453"/><text x="80" y="164" font-family="Arial" font-size="24" fill="#52625c">ESTÚDIO EDITORIAL</text><g font-family="Arial" fill="#193d32" font-weight="bold" font-size="${layout.titleSize}">${title.map((line, i) => `<text x="80" y="${295 + i * layout.titleLineHeight}">${escape(line)}</text>`).join("")}</g><g font-family="Arial" font-size="${layout.bodySize}" fill="#394e46">${body.map((line, i) => `<text x="80" y="${layout.bodyY + i * layout.bodyLineHeight}">${escape(line)}</text>`).join("")}</g><line x1="80" x2="1000" y1="1220" y2="1220" stroke="#ced6ce"/><text x="80" y="1272" font-family="Arial" font-size="24" fill="#52625c">${index + 1} / ${total}</text></svg>`;
}
module.exports = { svgCard, wrap, cardLayout };
