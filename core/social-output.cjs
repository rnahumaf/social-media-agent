const { z } = require("zod");

const cardSchema = z
  .object({
    title: z.string().trim().min(1).max(90),
    body: z.string().trim().min(1).max(420),
  })
  .strict();
const socialSchema = z
  .object({
    caption: z.string().trim().min(1).max(200000),
    cards: z.array(cardSchema).min(2).max(8),
  })
  .strict();

const responseFormat = {
  type: "json_schema",
  json_schema: {
    name: "social_media_carousel",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        caption: {
          type: "string",
          minLength: 1,
          description: "Legenda final, incluindo hashtags quando forem úteis.",
        },
        cards: {
          type: "array",
          minItems: 2,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", minLength: 1, maxLength: 90 },
              body: {
                type: "string",
                minLength: 1,
                maxLength: 420,
                description:
                  "Texto conciso, preferencialmente com até 280 caracteres; limite absoluto de 420.",
              },
            },
            required: ["title", "body"],
          },
        },
      },
      required: ["caption", "cards"],
    },
  },
};

function json(content) {
  if (typeof content !== "string") throw new SyntaxError("not text");
  const clean = content
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(clean);
}

function describe(error) {
  if (error instanceof SyntaxError)
    return "A resposta não contém um JSON válido.";
  const issues = Array.isArray(error?.issues) ? error.issues : [];
  const longBodies = issues
    .filter(
      (issue) =>
        issue.code === "too_big" &&
        issue.path?.[0] === "cards" &&
        issue.path?.[2] === "body",
    )
    .map((issue) => Number(issue.path[1]) + 1);
  const longTitles = issues
    .filter(
      (issue) =>
        issue.code === "too_big" &&
        issue.path?.[0] === "cards" &&
        issue.path?.[2] === "title",
    )
    .map((issue) => Number(issue.path[1]) + 1);
  const cardCount = issues.find(
    (issue) => issue.path?.[0] === "cards" && issue.path.length === 1,
  );
  const parts = [];
  if (longBodies.length)
    parts.push(
      `${longBodies.length} ${longBodies.length === 1 ? "texto de card ultrapassa" : "textos de cards ultrapassam"} 420 caracteres (card${longBodies.length === 1 ? "" : "s"} ${longBodies.join(", ")}).`,
    );
  if (longTitles.length)
    parts.push(
      `${longTitles.length} ${longTitles.length === 1 ? "título ultrapassa" : "títulos ultrapassam"} 90 caracteres (card${longTitles.length === 1 ? "" : "s"} ${longTitles.join(", ")}).`,
    );
  if (cardCount) parts.push("O carrossel precisa conter de 2 a 8 cards.");
  if (!parts.length)
    parts.push(
      "A resposta não contém todos os campos de legenda, título e texto exigidos.",
    );
  return parts.join(" ");
}

function parse(content) {
  let value;
  try {
    value = json(content);
  } catch (error) {
    const failure = Error(describe(error));
    failure.cause = error;
    throw failure;
  }
  const result = socialSchema.safeParse(value);
  if (!result.success) {
    const failure = Error(describe(result.error));
    failure.cause = result.error;
    throw failure;
  }
  return result.data;
}

function splitText(value, maximum) {
  let remaining = value.trim().replace(/\s+/g, " ");
  const pieces = [];
  while (remaining.length > maximum) {
    let end = maximum;
    if (/^[\uD800-\uDBFF]$/.test(remaining.at(end - 1))) end--;
    const window = remaining.slice(0, end);
    const sentence = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
    );
    const boundary = window.lastIndexOf(" ");
    if (sentence >= Math.floor(maximum * 0.6)) end = sentence + 1;
    else if (boundary >= Math.floor(maximum * 0.6)) end = boundary;
    pieces.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

function continuationTitle(title, part, total) {
  const numbered = `${title} (${part}/${total})`;
  return numbered.length <= 90 ? numbered : `Continuação (${part}/${total})`;
}

function fitLengths(content) {
  let value;
  try {
    value = json(content);
  } catch {
    return null;
  }
  if (
    !value ||
    typeof value !== "object" ||
    typeof value.caption !== "string" ||
    !Array.isArray(value.cards)
  )
    return null;
  if (
    value.cards.some(
      (card) =>
        !card ||
        typeof card !== "object" ||
        typeof card.title !== "string" ||
        typeof card.body !== "string" ||
        !card.title.trim() ||
        !card.body.trim(),
    )
  )
    return null;
  const cards = value.cards.flatMap((card) => {
    const titleParts = splitText(card.title, 90);
    const title = titleParts.shift();
    const pieces = splitText([...titleParts, card.body.trim()].join(" "), 420);
    return pieces.map((body, index) => ({
      title:
        index === 0
          ? title
          : continuationTitle(title, index + 1, pieces.length),
      body,
    }));
  });
  if (cards.length > 8) return null;
  const candidate = { caption: value.caption.trim(), cards };
  const result = socialSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

module.exports = {
  socialSchema,
  responseFormat,
  parse,
  fitLengths,
  describe,
  splitText,
};
