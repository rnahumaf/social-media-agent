const { z } = require("zod");
const { current, digest } = require("./workspace.cjs");
const { cardSchema, knowledgeFor, channels } = require("./editorial-model.cjs");
const { naturalWriting } = require("./editorial-prompts.cjs");
const providers = require("./providers.cjs");
const { cardText } = require("./card-rich-text.mjs");
const {
  cardTextSchema,
  cardTextJSON,
  richTextDefs,
  cardFormattingInstructions,
} = require("./card-text-schema.cjs");
const inputSchema = z.object({
  id: z.string(),
  target: z.enum(["article", "caption", "card"]),
  baseRevisionId: z.string(),
  text: z.string().max(200000).optional(),
  card: cardSchema.optional(),
  instruction: z
    .string()
    .max(10000)
    .default("Melhore a clareza e adapte ao canal, preservando o significado."),
});
async function rewrite(w, payload, signal) {
  const input = inputSchema.parse(payload);
  const p = w.project(input.id);
  if (!channels(p).includes(input.target === "article" ? "blog" : "instagram"))
    throw Error("Este canal não está selecionado na pauta.");
  if (current(p)?.id !== input.baseRevisionId)
    throw Error("A revisão mudou. Solicite uma nova sugestão.");
  const role = input.target === "article" ? "writer" : "social";
  if (!w.secrets?.openrouter || !w.state.settings.models[role])
    throw Error(
      "Configure a chave OpenRouter e o modelo deste editor para usar a IA.",
    );
  const original =
    input.target === "card" ? input.card && cardText(input.card) : input.text;
  if (
    input.target === "card" &&
    (!input.card || (!input.card.title.trim() && !input.card.body.trim()))
  )
    throw Error("Escreva um texto no card antes de solicitar uma reescrita.");
  if (!original || (typeof original === "string" && !original.trim()))
    throw Error("Escreva um texto antes de solicitar uma reescrita.");
  const run = {
    id: require("node:crypto").randomUUID(),
    role,
    phase: "rewrite",
    model: w.state.settings.models[role],
    status: "running",
    startedAt: new Date().toISOString(),
  };
  p.runs.push(run);
  p.messages.push({
    role: "user",
    agent: role,
    internal: true,
    target: input.target,
    content: JSON.stringify({ original, instruction: input.instruction }),
    at: run.startedAt,
  });
  w.save();
  try {
    const request = {
      key: w.secrets.openrouter,
      model: run.model,
      signal,
      allowPartial: true,
      system: `${naturalWriting}\nReescreva somente ${input.target === "article" ? "o artigo para BLOG em Markdown; não inclua legenda, cards nem hashtags" : input.target === "caption" ? "a legenda do INSTAGRAM, com até 2200 caracteres" : "o card do INSTAGRAM, retornando JSON com title de até 90 e body de até 420 caracteres"}. Use apenas o conteúdo fornecido. Não invente fontes ou acrescente fatos. Não faça pesquisa externa.\n${input.target === "card" ? cardFormattingInstructions : ""}\nPreferências do autor:\n${knowledgeFor(w.state, role)}`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            text: original,
            instruction: input.instruction,
            brief: p.brief,
            decisions: require("./context.cjs").decisions(p),
            conversation: require("./context.cjs").history(
              p.messages,
              role,
              input.instruction,
              900,
            ),
          }),
        },
      ],
      ...(input.target === "card"
        ? {
            responseFormat: {
              type: "json_schema",
              json_schema: {
                name: "rewrite_card",
                strict: true,
                schema: { ...cardTextJSON, $defs: richTextDefs },
              },
            },
          }
        : {}),
    };
    const limits = input.target === "article" ? [6000, 9000] : [2200, 4500];
    let result;
    for (const [index, maxTokens] of limits.entries()) {
      signal?.throwIfAborted();
      result = await providers.complete({
        ...request,
        system:
          request.system +
          (index
            ? "\nA tentativa anterior atingiu o limite. Retorne a sugestão integral com concisão, preservando o significado."
            : ""),
        maxTokens,
      });
      run.usage ||= {};
      for (const [key, value] of Object.entries(result.usage || {}))
        if (typeof value === "number")
          run.usage[key] = (run.usage[key] || 0) + value;
      run.model = result.model || run.model;
      if (result.contextUsage) run.contextUsage = result.contextUsage;
      if (result.finishReason) run.finishReason = result.finishReason;
      if (result.finishReason === "length") {
        p.messages.push({
          role: "assistant",
          agent: role,
          internal: true,
          partial: true,
          target: input.target,
          content: result.content,
          usage: result.usage,
          at: new Date().toISOString(),
        });
        w.save();
        signal?.throwIfAborted();
        if (index === limits.length - 1)
          throw Error(
            "A reescrita atingiu o limite máximo. O texto parcial e o consumo foram salvos; reduza o trecho ou escolha outro modelo.",
          );
        continue;
      }
      signal?.throwIfAborted();
      break;
    }
    const value =
      input.target === "card"
        ? cardTextSchema.parse(
            JSON.parse(
              result.content
                .replace(/^```(?:json)?\s*/, "")
                .replace(/\s*```$/, ""),
            ),
          )
        : z
            .string()
            .trim()
            .min(1)
            .max(input.target === "caption" ? 2200 : 200000)
            .parse(result.content);
    run.status = "completed";
    p.messages.push({
      role: "assistant",
      agent: role,
      internal: true,
      target: input.target,
      content: result.content,
      at: new Date().toISOString(),
    });
    return {
      target: input.target,
      baseRevisionId: input.baseRevisionId,
      inputHash: digest(original),
      value,
    };
  } catch (error) {
    run.status = signal?.aborted ? "cancelled" : "failed";
    run.error = error.message;
    throw error;
  } finally {
    run.finishedAt = new Date().toISOString();
    w.save();
  }
}
module.exports = { rewrite };
