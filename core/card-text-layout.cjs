const { richTextBlocks } = require("./card-rich-text.mjs");

// Conservative advances for the two supported font families. Wrapping keeps
// marks attached to their characters, including a word split across marks.
function advance(char, size, span) {
  const base = char.normalize("NFD")[0];
  let em = /\s/.test(char)
    ? 0.34
    : /[ilI.,:;!'|]/.test(base)
      ? 0.36
      : /[mwMW@%&]/.test(base)
        ? 1.05
        : /[A-Z]/.test(base)
          ? 0.8
          : /[a-z0-9]/.test(base)
            ? 0.64
            : /\p{Mark}/u.test(char)
              ? 0
              : 1.05;
  if (span.bold) em *= 1.08;
  if (span.italic) em *= 1.04;
  return em * size;
}
function wrapSpans(spans, width, size) {
  const chars = spans.flatMap((span) =>
    Array.from(span.text, (text) => ({ ...span, text })),
  );
  const lines = [];
  let line = [],
    used = 0;
  const push = () => {
    lines.push(line);
    line = [];
    used = 0;
  };
  for (const char of chars) {
    if (char.text === "\n") {
      push();
      continue;
    }
    const w = advance(char.text, size, char);
    if (used + w > width && line.length) {
      const space = line.findLastIndex((c) => /\s/.test(c.text));
      if (space > 0) {
        const tail = line.splice(space + 1);
        line.pop();
        push();
        line = tail;
        used = line.reduce((sum, c) => sum + advance(c.text, size, c), 0);
      } else push();
      if (used + w > width && line.length) push();
      if (!line.length && /\s/.test(char.text)) continue;
    }
    line.push(char);
    used += w;
  }
  push();
  return lines.map((line) => {
    const runs = [];
    for (const char of line) {
      const last = runs.at(-1);
      if (
        last &&
        ["bold", "italic", "underline"].every((key) => last[key] === char[key])
      )
        last.text += char.text;
      else runs.push({ ...char });
    }
    return runs;
  });
}
function layoutText(doc, size, lineHeight) {
  const result = [];
  let y = 0;
  for (const block of richTextBlocks(doc)) {
    const markerWidth = block.marker
      ? Array.from(block.marker).reduce(
          (sum, c) => sum + advance(c, size, {}),
          0,
        ) + 16
      : 0;
    const gutter =
      Array.from(block.markerSpace).reduce(
        (sum, c) => sum + advance(c, size, {}),
        0,
      ) + 16;
    const offset =
      block.indent * 56 + (block.markerSpace ? Math.max(0, gutter - 56) : 0);
    const lines = wrapSpans(block.spans, 910 - offset, size);
    if (result.length) y += lineHeight * (block.marker ? 0.12 : 0.28);
    lines.forEach((spans, i) => {
      result.push({
        spans,
        x: 80 + offset,
        y,
        marker: i === 0 ? block.marker : "",
        markerX: 80 + offset - markerWidth,
      });
      y += lineHeight;
    });
  }
  return { lines: result, height: y };
}
function svgText(lines, top, escape) {
  return lines
    .map(
      (line) =>
        `${line.marker ? `<text x="${line.markerX}" y="${top + line.y}" font-weight="normal">${escape(line.marker)}</text>` : ""}<text x="${line.x}" y="${top + line.y}" xml:space="preserve">${line.spans.map((span) => `<tspan font-weight="${span.bold ? "bold" : "normal"}" font-style="${span.italic ? "italic" : "normal"}" text-decoration="${span.underline ? "underline" : "none"}">${escape(span.text)}</tspan>`).join("")}</text>`,
    )
    .join("");
}
module.exports = { layoutText, svgText };
