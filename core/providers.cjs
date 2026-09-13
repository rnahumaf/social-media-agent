const { XMLParser } = require("fast-xml-parser");
const service = (url) =>
  new URL(url).hostname === "openrouter.ai" ? "OpenRouter" : "PubMed";
function retryDelay(response) {
  const value = response.headers?.get?.("retry-after");
  if (!value) return 1500;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, Math.min(delay, 5001)) : 1500;
}
function externalError(url, status) {
  const name = service(url);
  if (name === "OpenRouter") {
    if (status === 401)
      return Error(
        "O OpenRouter recusou a chave (HTTP 401). Confira a chave salva no cofre.",
      );
    if (status === 402)
      return Error(
        "O OpenRouter informou saldo insuficiente (HTTP 402). Confira os créditos da conta.",
      );
    if (status === 429)
      return Error(
        "O OpenRouter limitou as chamadas (HTTP 429). Aguarde um minuto e tente novamente. Se continuar, confira os limites da chave e o saldo da conta no OpenRouter.",
      );
    if (status === 404)
      return Error(
        "O modelo escolhido não está disponível no OpenRouter (HTTP 404). Atualize o catálogo e selecione outro modelo.",
      );
  }
  if (name === "PubMed" && status === 429)
    return Error(
      "O PubMed limitou temporariamente as consultas (HTTP 429). Aguarde um minuto e tente novamente.",
    );
  return Error(`${name} retornou HTTP ${status}.`);
}
const wait = (delay, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", abort, { once: true });
  });
async function response(url, options = {}, type = "json") {
  const attempts = 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await fetch(url, {
      ...options,
      redirect: "error",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(90000)])
        : AbortSignal.timeout(90000),
    });
    if (result.ok) return result[type]();
    const delay = retryDelay(result);
    if (result.status !== 429 || attempt === attempts - 1 || delay > 5000)
      throw externalError(url, result.status);
    await wait(delay, options.signal);
  }
}
async function request(url, options = {}) {
  return response(url, options, "json");
}
async function models() {
  const data = await request("https://openrouter.ai/api/v1/models");
  return data.data
    .filter(
      (m) => m.architecture?.output_modalities?.includes("text") !== false,
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      context: m.context_length,
      pricing: m.pricing,
    }));
}
async function complete({ key, model, system, messages, signal }) {
  if (!key) throw Error("A chave OpenRouter não foi informada.");
  if (!model) throw Error("Nenhum modelo foi escolhido para este agente.");
  const data = await request("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 5000,
      // Mantém o modelo escolhido e permite outro provedor desse mesmo modelo.
      provider: { allow_fallbacks: true },
    }),
    signal,
  });
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw Error("O modelo não retornou texto.");
  if (data.choices[0].finish_reason === "length")
    throw Error(
      "A resposta excedeu o limite; reduza o briefing e tente novamente.",
    );
  return { content, model: data.model, usage: data.usage || {} };
}
async function pubmed(query, signal) {
  if (!query.trim())
    throw Error("O pesquisador não definiu uma consulta válida para o PubMed.");
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
  const search = await request(
    base +
      "esearch.fcgi?db=pubmed&retmode=json&retmax=6&term=" +
      encodeURIComponent(query),
    { signal },
  );
  const ids = search.esearchresult?.idlist || [];
  if (!ids.length) return [];
  await new Promise((r) => setTimeout(r, 400));
  const xml = await response(
    base + "efetch.fcgi?db=pubmed&retmode=xml&id=" + ids.join(","),
    {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    },
    "text",
  );
  const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const articles = doc.PubmedArticleSet?.PubmedArticle;
  return (Array.isArray(articles) ? articles : [articles])
    .filter(Boolean)
    .map((a) => {
      const c = a.MedlineCitation,
        article = c.Article;
      return {
        pmid: String(c.PMID?.["#text"] || c.PMID),
        title:
          typeof article.ArticleTitle === "string"
            ? article.ArticleTitle
            : JSON.stringify(article.ArticleTitle),
        abstract: article.Abstract
          ? JSON.stringify(article.Abstract.AbstractText)
          : "",
        access: article.Abstract ? "abstract" : "metadata",
        url:
          "https://pubmed.ncbi.nlm.nih.gov/" +
          String(c.PMID?.["#text"] || c.PMID) +
          "/",
        retrievedAt: new Date().toISOString(),
      };
    });
}
module.exports = { request, models, complete, pubmed };
