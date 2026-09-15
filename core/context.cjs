// Conservative estimate, not a tokenizer. Whole primary material is never silently cut.
const estimateTokens = (value) =>
  Math.ceil(
    Buffer.byteLength(
      typeof value === "string" ? value : JSON.stringify(value),
      "utf8",
    ) / 3,
  );
function clip(value, tokens) {
  const text = String(value || "");
  if (estimateTokens(text) <= tokens) return text;
  const suffix =
    "\n[trecho limitado para esta chamada; original preservado no workspace]";
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid) + suffix) <= tokens) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + suffix;
}
function history(messages, role, query = "", budget = 1800) {
  const terms = new Set(query.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []);
  const items = messages
    .map((m, index) => ({ m, index }))
    .filter(
      ({ m }) =>
        !m.internal &&
        !m.agent &&
        (!m.target || m.target === role) &&
        m.status !== "sending",
    );
  const scored = items.map((item, n) => ({
    ...item,
    score:
      (n >= items.length - 4 ? 1000 + n : 0) +
      [...terms].filter((t) => item.m.content.toLowerCase().includes(t)).length,
  }));
  let left = budget;
  const chosen = [];
  for (const item of scored.sort(
    (a, b) => b.score - a.score || b.index - a.index,
  )) {
    if (left < 80) break;
    const content = clip(item.m.content, Math.min(left - 20, 650));
    left -= estimateTokens(content) + 20;
    chosen.push({ index: item.index, role: item.m.role, content });
  }
  return chosen
    .sort((a, b) => a.index - b.index)
    .map(({ role, content }) => ({ role, content }));
}
function profile(state, role) {
  const k = state.knowledge || { general: state.memory || "" };
  return [
    clip(k.general || state.memory, 1200),
    role === "writer"
      ? clip(k.blog, 600)
      : role === "social"
        ? clip(k.instagram, 600)
        : "",
    role !== "researcher" && k.examples
      ? "Exemplos de estilo (não são fontes factuais):\n" +
        clip(k.examples, 500)
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
function decisions(p) {
  return (
    p.decisions || { audience: "", objective: "", thesis: "", constraints: "" }
  );
}
function prepareContext(value) {
  const copy = { ...value };
  // Auxiliary material may be excerpted; the current article/card and persistent decisions remain intact.
  if (copy.previous)
    copy.previous = Object.fromEntries(
      Object.entries(copy.previous).map(([k, v]) => [
        k,
        typeof v === "string" ? clip(v, 2500) : v,
      ]),
    );
  if (copy.previousAttempt)
    copy.previousAttempt = clip(copy.previousAttempt, 2000);
  return JSON.stringify(copy);
}
const outputLimits = {
  search: 800,
  researcher: 3000,
  writer: 6000,
  social: 4000,
  reviewer: 3000,
  chat: 2000,
  rewrite: 6000,
};
function budget(system, messages, maxTokens, contextWindow = 32768) {
  const estimatedInputTokens = estimateTokens({ system, messages }) + 200;
  const inputBudget = Math.min(24000, contextWindow - maxTokens - 1000);
  if (estimatedInputTokens > inputBudget)
    throw Error(
      `O material desta operação excede o orçamento de contexto (estimativa ${estimatedInputTokens}/${inputBudget} tokens). Reduza o briefing ou divida o texto; o original continua salvo.`,
    );
  return { estimatedInputTokens, inputBudget, maxTokens };
}
module.exports = {
  estimateTokens,
  clip,
  history,
  profile,
  decisions,
  prepareContext,
  outputLimits,
  budget,
};
