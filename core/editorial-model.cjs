const { z } = require("zod");
const channelsSchema = z
  .array(z.enum(["blog", "instagram"]))
  .min(1)
  .max(2)
  .refine((v) => new Set(v).size === v.length);
const researchSchema = z
  .array(z.enum(["pubmed", "web"]))
  .min(1)
  .max(2)
  .refine((v) => new Set(v).size === v.length);
const knowledgeSchema = z.object({
  general: z.string().max(100000),
  blog: z.string().max(30000),
  instagram: z.string().max(30000),
  examples: z.string().max(40000),
});
const defaultStyle = Object.freeze({
  layout: "text",
  background: "#f5f3ed",
  titleColor: "#193d32",
  textColor: "#394e46",
  accent: "#226453",
  font: "sans",
  fontScale: 1,
  signature: "ESTÚDIO EDITORIAL",
});
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const styleSchema = z.object({
  layout: z.enum(["text", "split", "background"]),
  background: color,
  titleColor: color,
  textColor: color,
  accent: color,
  font: z.enum(["sans", "serif"]),
  fontScale: z.number().min(0.85).max(1.15).optional(),
  signature: z.string().max(60),
});
const imageSchema = z.object({
  path: z.string().regex(/^assets\/[a-f0-9]{64}\.png$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  x: z.number().min(0).max(100).default(50),
  y: z.number().min(0).max(100).default(50),
  zoom: z.number().min(1).max(3).default(1),
});
const cardSchema = z.object({
  title: z.string().max(90),
  body: z.string().max(420),
  image: imageSchema.optional(),
});
function channels(p) {
  return p.channels || ["blog", "instagram"];
}
function allows(p, destination) {
  return (
    destination === "export" ||
    channels(p).includes(destination === "instagram" ? "instagram" : "blog")
  );
}
function knowledgeFor(state, role) {
  const k = state.knowledge || { general: state.memory || "" };
  return [
    k.general || state.memory,
    role === "writer" ? k.blog : role === "social" ? k.instagram : "",
    k.examples &&
      `Exemplos de estilo (não são fontes factuais):\n${k.examples}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
function scopedContext(p, role, artifacts = {}, previous) {
  const base = {
    title: p.title,
    brief: p.brief,
    sources: artifacts.sources || p.sources,
    dossier: artifacts.dossier || "",
  };
  // A conversa livre é demanda; respostas de agentes nunca voltam como instruções.
  base.conversation = p.messages
    .filter((m) => !m.internal && !m.agent && (!m.target || m.target === role))
    .slice(-20);
  if (role === "writer")
    return {
      ...base,
      article: artifacts.article || "",
      previous: previous ? { article: previous.article } : undefined,
    };
  if (role === "social")
    return {
      ...base,
      article: artifacts.article || previous?.article || "",
      previous: previous
        ? {
            caption: previous.caption,
            cards: previous.cards.map(({ title, body }) => ({ title, body })),
          }
        : undefined,
    };
  if (role === "reviewer")
    return {
      ...base,
      ...(channels(p).includes("blog")
        ? { article: artifacts.article || previous?.article || "" }
        : {}),
      ...(channels(p).includes("instagram")
        ? { social: artifacts.social }
        : {}),
    };
  return base;
}
module.exports = {
  channelsSchema,
  researchSchema,
  knowledgeSchema,
  styleSchema,
  imageSchema,
  cardSchema,
  defaultStyle,
  channels,
  allows,
  knowledgeFor,
  scopedContext,
};
