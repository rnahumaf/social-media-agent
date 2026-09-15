const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { cardSchema, styleSchema } = require("./editorial-model.cjs");
const contentSchema = z.object({
  article: z.string().max(200000),
  caption: z.string().max(200000),
  cards: z.array(cardSchema).max(10),
  style: styleSchema.optional(),
});
const draftSchema = z.object({
  baseRevisionId: z.string().nullable(),
  updatedAt: z.string(),
  content: contentSchema,
});
function fileFor(w, id) {
  w.project(id); // IDs are validated UUIDs by Workspace; never accept arbitrary paths.
  return path.join(w.dir, "drafts", id + ".json");
}
function readDraft(w, id) {
  const file = fileFor(w, id);
  if (!fs.existsSync(file)) return null;
  try {
    return draftSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw Error(
      "O rascunho desta pauta não pôde ser lido. O arquivo original foi preservado.",
    );
  }
}
function saveDraft(w, { id, content, baseRevisionId = null }) {
  const p = w.project(id),
    currentId = p.revisions.at(-1)?.id || null;
  if (baseRevisionId !== currentId)
    throw Error("A revisão mudou. Seu rascunho local não foi sobrescrito.");
  readDraft(w, id); // Do not overwrite an unreadable original draft.
  const draft = draftSchema.parse({
    baseRevisionId,
    content,
    updatedAt: new Date().toISOString(),
  });
  const file = fileFor(w, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(draft));
  fs.renameSync(file + ".tmp", file);
  return draft;
}
function clearDraft(w, id) {
  fs.rmSync(fileFor(w, id), { force: true });
}
module.exports = { saveDraft, readDraft, clearDraft, contentSchema };
