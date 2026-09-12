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
function svgCard(card, index, total) {
  const title = wrap(card.title, 24),
    body = wrap(card.body, 39);
  if (
    title.length > 5 ||
    body.length > 13 ||
    335 + title.length * 76 + (body.length - 1) * 50 > 1160
  )
    throw Error(
      "Texto longo demais para o template; reduza o card antes de exportar.",
    );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#f5f3ed"/><rect x="80" y="96" width="64" height="8" fill="#226453"/><text x="80" y="164" font-family="Arial" font-size="24" fill="#52625c">ESTÚDIO EDITORIAL</text><g font-family="Arial" fill="#193d32" font-weight="bold" font-size="62">${title.map((line, i) => `<text x="80" y="${295 + i * 76}">${escape(line)}</text>`).join("")}</g><g font-family="Arial" font-size="36" fill="#394e46">${body.map((line, i) => `<text x="80" y="${335 + title.length * 76 + i * 50}">${escape(line)}</text>`).join("")}</g><line x1="80" x2="1000" y1="1220" y2="1220" stroke="#ced6ce"/><text x="80" y="1272" font-family="Arial" font-size="24" fill="#52625c">${index + 1} / ${total}</text></svg>`;
}
module.exports = { svgCard, wrap };
