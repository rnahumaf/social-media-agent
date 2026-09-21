// Portable subset of the editor document. No HTML, URLs or executable nodes.
export function textDocument(text, bold = false) {
  return {
    type: "doc",
    content: text.split("\n").map((line) => ({
      type: "paragraph",
      ...(line
        ? {
            content: [
              {
                type: "text",
                text: line,
                ...(bold ? { marks: [{ type: "bold" }] } : {}),
              },
            ],
          }
        : {}),
    })),
  };
}

export function richTextPlain(node) {
  if (node.type === "text") return node.text;
  if (node.type === "hardBreak") return "\n";
  return (node.content || [])
    .map(richTextPlain)
    .join(node.type === "paragraph" ? "" : "\n");
}

export function richTextBlocks(doc) {
  const blocks = [];
  const visit = (node, depth = 0, marker = "", markerSpace = "") => {
    if (node.type === "paragraph") {
      blocks.push({
        indent: depth + (node.attrs?.indent || 0),
        marker,
        markerSpace,
        spans: (node.content || []).map((part) => ({
          text: part.type === "hardBreak" ? "\n" : part.text,
          bold: part.marks?.some((m) => m.type === "bold") || false,
          italic: part.marks?.some((m) => m.type === "italic") || false,
          underline: part.marks?.some((m) => m.type === "underline") || false,
        })),
      });
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      node.content.forEach((item, index) => {
        const label =
          node.type === "bulletList"
            ? "•"
            : `${(node.attrs?.start || 1) + index}.`;
        const widest =
          node.type === "bulletList"
            ? "•"
            : `${(node.attrs?.start || 1) + node.content.length - 1}.`;
        item.content.forEach((child, i) =>
          visit(child, depth + 1, i === 0 ? label : "", widest),
        );
      });
    } else {
      (node.content || []).forEach((child) => visit(child, depth));
    }
  };
  visit(doc);
  return blocks;
}

export function cardText(card) {
  return {
    title: card.title,
    body: card.body,
    ...(card.titleRich !== undefined ? { titleRich: card.titleRich } : {}),
    ...(card.bodyRich !== undefined ? { bodyRich: card.bodyRich } : {}),
  };
}

// Editor JSON and validated JSON can have different object key order. The
// rewrite guard compares content, not the serializer's insertion order.
export function cardTextKey(card) {
  return JSON.stringify(cardText(card), (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
}
