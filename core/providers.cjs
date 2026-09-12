const { XMLParser } = require("fast-xml-parser");
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(90000)])
      : AbortSignal.timeout(90000),
  });
  if (!response.ok)
    throw Error(`Serviço externo retornou HTTP ${response.status}.`);
  return response.json();
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
  if (!key || !model)
    throw Error("Desbloqueie o cofre e escolha um modelo para cada agente.");
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
      provider: { allow_fallbacks: false },
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
  const response = await fetch(
    base + "efetch.fcgi?db=pubmed&retmode=xml&id=" + ids.join(","),
    {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw Error("Falha ao consultar registros PubMed.");
  const doc = new XMLParser({ ignoreAttributes: false }).parse(
    await response.text(),
  );
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
