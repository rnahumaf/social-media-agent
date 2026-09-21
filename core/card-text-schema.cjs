const { z } = require("zod");
const { richTextPlain, richTextBlocks } = require("./card-rich-text.mjs");
const inline = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().min(1).max(420),
      marks: z
        .array(
          z.object({ type: z.enum(["bold", "italic", "underline"]) }).strict(),
        )
        .max(3)
        .optional(),
    })
    .strict(),
  z.object({ type: z.literal("hardBreak") }).strict(),
]);
const paragraph = z
  .object({
    type: z.literal("paragraph"),
    attrs: z
      .object({ indent: z.number().int().min(0).max(3).optional() })
      .strict()
      .optional(),
    content: z.array(inline).max(420).optional(),
  })
  .strict();
const list = z.lazy(() =>
  z.discriminatedUnion("type", [
    z
      .object({
        type: z.literal("bulletList"),
        content: z.array(item).min(1).max(32),
      })
      .strict(),
    z
      .object({
        type: z.literal("orderedList"),
        attrs: z
          .object({ start: z.number().int().min(1).max(99).optional() })
          .strict()
          .optional(),
        content: z.array(item).min(1).max(32),
      })
      .strict(),
  ]),
);
const item = z
  .object({
    type: z.literal("listItem"),
    content: z
      .tuple([paragraph])
      .rest(z.union([paragraph, list]))
      .refine((v) => v.length <= 32),
  })
  .strict();
// Bound nesting before the recursive parser to reject hostile/deep payloads safely.
const bounded = z.unknown().superRefine((value, ctx) => {
  let count = 0;
  const walk = (node, depth) => {
    if (++count > 1000 || depth > 12) return false;
    return (
      !Array.isArray(node?.content) ||
      node.content.every((child) => walk(child, depth + 1))
    );
  };
  if (!walk(value, 0))
    ctx.addIssue({
      code: "custom",
      message: "Formatação muito complexa para um card.",
      fatal: true,
    });
});
const richTextSchema = bounded
  .pipe(
    z
      .object({
        type: z.literal("doc"),
        content: z
          .array(z.union([paragraph, list]))
          .min(1)
          .max(32),
      })
      .strict(),
  )
  .superRefine((doc, ctx) => {
    if (richTextBlocks(doc).some((block) => block.indent > 4))
      ctx.addIssue({
        code: "custom",
        message: "Use no máximo três níveis de recuo.",
      });
  });
const cardTextFields = {
  title: z.string().max(90),
  body: z.string().max(420),
  titleRich: richTextSchema.nullable().optional(),
  bodyRich: richTextSchema.nullable().optional(),
};
function validateCardText(card, ctx) {
  for (const field of ["title", "body"]) {
    if (
      card[field + "Rich"] &&
      richTextPlain(card[field + "Rich"]) !== card[field]
    )
      ctx.addIssue({
        code: "custom",
        path: [field + "Rich"],
        message: `A formatação deve conter o mesmo texto de ${field}.`,
      });
  }
}
const cardTextSchema = z
  .object(cardTextFields)
  .strict()
  .superRefine(validateCardText);

// Structured outputs require every property to be required. Empty content and
// mark arrays represent empty paragraphs and unformatted text; null is legacy/plain.
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const array = (items, maxItems = 32) => ({ type: "array", items, maxItems });
const richTextDefs = {
  cardInline: {
    anyOf: [
      object({
        type: { const: "text", type: "string" },
        text: { type: "string", minLength: 1, maxLength: 420 },
        marks: array(
          object({
            type: { type: "string", enum: ["bold", "italic", "underline"] },
          }),
          3,
        ),
      }),
      object({ type: { const: "hardBreak", type: "string" } }),
    ],
  },
  cardParagraph: object({
    type: { const: "paragraph", type: "string" },
    attrs: object({ indent: { type: "integer", minimum: 0, maximum: 3 } }),
    content: array(ref("cardInline"), 420),
  }),
  cardList: {
    anyOf: [
      object({
        type: { const: "bulletList", type: "string" },
        content: { ...array(ref("cardListItem")), minItems: 1 },
      }),
      object({
        type: { const: "orderedList", type: "string" },
        attrs: object({ start: { type: "integer", minimum: 1, maximum: 99 } }),
        content: { ...array(ref("cardListItem")), minItems: 1 },
      }),
    ],
  },
  cardListItem: object({
    type: { const: "listItem", type: "string" },
    content: {
      ...array({ anyOf: [ref("cardParagraph"), ref("cardList")] }),
      minItems: 1,
    },
  }),
  cardDocument: object({
    type: { const: "doc", type: "string" },
    content: {
      ...array({ anyOf: [ref("cardParagraph"), ref("cardList")] }),
      minItems: 1,
    },
  }),
};
const cardTextJSON = object({
  title: { type: "string", maxLength: 90 },
  body: {
    type: "string",
    maxLength: 420,
    description: "Texto visível conciso; prefira até 280 caracteres.",
  },
  titleRich: { anyOf: [ref("cardDocument"), { type: "null" }] },
  bodyRich: { anyOf: [ref("cardDocument"), { type: "null" }] },
});
const cardFormattingInstructions = `Os cards permitem negrito, itálico, sublinhado, parágrafos, quebras de linha, listas com marcadores, listas numeradas e recuo. Use titleRich e bodyRich com documentos JSON no formato {"type":"doc","content":[...]}, ou null para texto simples. Mantenha title e body como o texto visível idêntico ao documento: una parágrafos e itens por \\n; não inclua os marcadores ou números das listas nesses campos. Os limites de 90/420 caracteres contam apenas esse texto visível, incluindo quebras de linha.
Parágrafo: {"type":"paragraph","attrs":{"indent":0},"content":[{"type":"text","text":"Trecho","marks":[{"type":"bold"},{"type":"italic"},{"type":"underline"}]}]}. Use marks:[] para texto normal, {"type":"hardBreak"} para quebra dentro do parágrafo e content:[] para parágrafo vazio. Use apenas as marcas necessárias. O título simples já aparece em negrito; no título rico, declare bold nos trechos que devem ter negrito.
Lista: {"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","attrs":{"indent":0},"content":[{"type":"text","text":"Um item","marks":[]}]}]}]}. Para numerar, use type:"orderedList" e attrs:{"start":1}. Cada item começa com um parágrafo; listas aninhadas vêm depois dele. Use indent de 0 a 3 nos parágrafos; limite a três níveis adicionais de recuo nas listas. Preserve formatação existente ao reescrever, salvo pedido para alterá-la. Distribua conteúdo denso entre mais cards; não use HTML ou Markdown nos campos de texto.`;
module.exports = {
  richTextSchema,
  cardTextFields,
  validateCardText,
  cardTextSchema,
  cardTextJSON,
  richTextDefs,
  cardFormattingInstructions,
};
