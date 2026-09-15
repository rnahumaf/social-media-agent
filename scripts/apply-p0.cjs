// One-shot branch-only transformation. Removed before merging the verified source changes.
const fs = require("node:fs");
function edit(file, fn) {
  let text = fs.readFileSync(file, "utf8");
  const replace = (old, next) => {
    if (text.split(old).length !== 2) throw Error(`Expected unique anchor in ${file}: ${old.slice(0, 120)}`);
    text = text.replace(old, next);
  };
  const range = (start, end, next) => {
    const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
    if (a < 0 || b < 0) throw Error(`Missing range in ${file}: ${start}`);
    text = text.slice(0, a) + next + text.slice(b);
  };
  fn(replace, range, () => text, value => { text = value; });
  fs.writeFileSync(file, text);
}
edit("core/workspace.cjs", (r) => {
  r('const editorial = require("./editorial-model.cjs");', 'const editorial = require("./editorial-model.cjs");\nconst { reviewFeedback } = require("./provenance.cjs");');
  r('  sources: z.array(z.any()).optional(),', '  sources: z.array(z.any()).optional(),\n  research: z.object({ sessionId: z.string().optional(), searches: z.array(z.any()) }).optional(),');
  r('      publications: z.record(z.any()),', '      publications: z.record(z.any()),\n      publicationHistory: z.array(z.any()).optional(),');
  r('      ...this.state,\n      unlocked:', '      ...this.state,\n      projects: this.state.projects.map(p => ({ ...p, reviewFeedback: reviewFeedback(p) })),\n      unlocked:');
  r('    Object.assign(p, changes);', '    if (changes.title !== p.title) {\n      for (const publication of Object.values(p.publications)) {\n        if (!publication.title) publication.title = p.title;\n      }\n    }\n    Object.assign(p, changes);');
});
edit("core/pipeline.cjs", (r) => {
  r('const editorial = require("./editorial-model.cjs");', 'const editorial = require("./editorial-model.cjs");\nconst { reviewFingerprint } = require("./provenance.cjs");');
  r('    origin: isDemo(w) ? "demo" : "ai",', '    research: {\n      sessionId: p.sessions?.at(-1)?.id,\n      searches: [\n        ...(partial ? previous?.research?.searches || [] : []),\n        ...(p.sessions?.at(-1)?.artifacts?.searches || []),\n      ],\n    },\n    origin: isDemo(w) ? "demo" : "ai",');
  r('      p.messages.push({\n        role: "assistant",\n        agent: role,', '      p.messages.push({\n        role: "assistant",\n        ...(role === "reviewer" ? {\n          revisionId: current(p)?.id,\n          reviewedChannels: selected,\n          reviewFingerprint: reviewFingerprint(p, current(p), selected),\n        } : {}),\n        agent: role,');
});
edit("core/providers.cjs", (r) => {
  r('      throw externalError(url, result.status);', '      {\n        const error = externalError(url, result.status);\n        error.httpStatus = result.status;\n        throw error;\n      }');
});
edit("core/rewrite.cjs", (r) => {
  r('    const value =\n', '    signal?.throwIfAborted();\n    const value =\n');
  r('    run.status = "failed";', '    run.status = signal?.aborted ? "cancelled" : "failed";');
});
edit("core/publish.cjs", (r) => {
  r('const { request } = require("./providers.cjs");', 'const { request } = require("./providers.cjs");\nconst { failureStatus } = require("./publication-errors.cjs");');
  r('  if (previous?.revision === revision.id && previous.status === "published")', '  if (previous?.revision === revision.id && ["published", "reconciled"].includes(previous.status) && (!previous.title || previous.title === p.title))');
  r('  p.publications.wordpress = {\n    status: "sending",', '  if (previous) (p.publicationHistory ||= []).push({ channel: "wordpress", ...structuredClone(previous) });\n  p.publications.wordpress = {\n    title: p.title,\n    url: previous?.url,\n    status: "sending",');
  r('    p.publications.wordpress = {\n      status: "published",', '    p.publications.wordpress = {\n      title: p.title,\n      status: "published",');
  r('    p.publications.wordpress.status = "uncertain";', '    p.publications.wordpress.status = failureStatus(e);');
  r('      "Resultado da publicação incerto. Verifique o WordPress; a repetição automática foi bloqueada.",', '      p.publications.wordpress.status === "failed"\n        ? "O WordPress recusou o envio. Confira a conexão antes de tentar novamente."\n        : "Resultado da publicação incerto. Use Verificar resultado no WordPress; nenhum envio será repetido automaticamente.",');
  r('  if (p.publications.instagram)\n', '  const previous = p.publications.instagram;\n  if (previous && previous.status !== "failed")\n');
  r('  p.publications.instagram = {\n    status: "sending",', '  if (previous) (p.publicationHistory ||= []).push({ channel: "instagram", ...structuredClone(previous) });\n  p.publications.instagram = {\n    attemptVersion: 2,\n    destination: s.instagramAccount,\n    title: p.title,\n    status: "sending",');
  r('    const result = await request(base + "/media_publish", {', '    p.publications.instagram.publishAttemptedAt = new Date().toISOString();\n    w.save();\n    const result = await request(base + "/media_publish", {');
  r('    p.publications.instagram.status = "uncertain";', '    p.publications.instagram.status = failureStatus(e, !!p.publications.instagram.publishAttemptedAt);');
  r('      "Tentativa Instagram não confirmada. Verifique a conta e os contêineres; repetição bloqueada.",', '      p.publications.instagram.status === "failed"\n        ? "O envio não foi publicado. Corrija o erro e tente novamente quando estiver pronto."\n        : "Tentativa Instagram não confirmada. Use Verificar resultado; nenhum envio será repetido automaticamente.",');
});
edit("core/blogger.cjs", (r) => {
  r('const { request } = require("./providers.cjs");', 'const { request } = require("./providers.cjs");\nconst { failureStatus } = require("./publication-errors.cjs");');
  r('  if (previous?.revision === r.id && previous.status === "published")', '  if (previous?.revision === r.id && ["published", "reconciled"].includes(previous.status) && (!previous.title || previous.title === p.title))');
  r('  p.publications.blogger = {\n    status: "sending",', '  if (previous) (p.publicationHistory ||= []).push({ channel: "blogger", ...structuredClone(previous) });\n  p.publications.blogger = {\n    title: p.title,\n    url: previous?.url,\n    status: "sending",');
  r('    p.publications.blogger = {\n      status: "published",', '    p.publications.blogger = {\n      title: p.title,\n      status: "published",');
  r('  } catch {\n    p.publications.blogger.status = "uncertain";', '  } catch (error) {\n    p.publications.blogger.status = failureStatus(error);');
  r('      "Resultado Blogger incerto. Confira o blog; a repetição automática foi bloqueada.",', '      p.publications.blogger.status === "failed"\n        ? "O Blogger recusou o envio. Confira a conexão antes de tentar novamente."\n        : "Resultado Blogger incerto. Use Verificar resultado; nenhum envio será repetido automaticamente.",');
});
edit("electron/main.cjs", (r, range, read, write) => {
  r('let win,\n  w,\n  busy = false,\n  controller,\n  rememberedVaults;', 'let win, w, rememberedVaults;\nconst { OperationManager } = require("../core/operations.cjs");\nconst operations = new OperationManager();\nconst cancellable = new Set(["run", "chat", "rewrite", "instagramConnect", "wordpressConnect", "bloggerConnect"]);');
  write(read().replaceAll('    controller = new AbortController();\n', '').replaceAll('controller.signal', 'operations.signal'));
  r('  state: () => w?.snapshot() || null,', '  state: () => w ? { ...w.snapshot(), operation: operations.snapshot() } : null,');
  r('  cancel: () => {\n    controller?.abort();\n    return true;\n  },', '  cancel: ({ operationId } = {}) => operations.cancel(operationId),');
  range('  chat: async ({ id, message }) => {', '  backup: async () => {', `  chat: async ({ id, message, requestId = crypto.randomUUID() }) => {
    if (typeof message !== "string" || !message.trim() || message.length > 10000 || typeof requestId !== "string" || requestId.length > 100)
      throw Error("Mensagem inválida.");
    const p = w.project(id);
    let userMessage = p.messages.find(m => m.role === "user" && m.requestId === requestId);
    if (userMessage && userMessage.content !== message) throw Error("Este envio pertence a outra mensagem.");
    if (userMessage?.status === "completed") return w.snapshot();
    if (!userMessage) {
      userMessage = { role: "user", content: message, requestId, at: new Date().toISOString() };
      p.messages.push(userMessage);
    }
    userMessage.status = "sending";
    delete userMessage.error;
    w.save();
    try {
      const result = testMode && w.state.settings.demo
        ? { content: "Sua orientação ficou registrada. Ao gerar uma revisão, os agentes receberão as mensagens recentes." }
        : await providers.complete({
          key: w.secrets?.openrouter,
          model: w.state.settings.models[editorial.channels(p).includes("blog") ? "writer" : "social"],
          signal: operations.signal,
          system: chatInstruction + "\\n\\nContexto editorial deste projeto:\\n" + JSON.stringify({
            brief: p.brief, revision: current(p),
            memory: editorial.knowledgeFor(w.state, editorial.channels(p).includes("blog") ? "writer" : "social"),
          }),
          messages: p.messages.filter(m => !m.internal && !m.agent).slice(-20).map(({ role, content }) => ({ role, content })),
        });
      operations.signal?.throwIfAborted();
      userMessage.status = "completed";
      p.messages.push({ role: "assistant", content: result.content, at: new Date().toISOString(), usage: result.usage, requestId });
      w.save();
      return w.snapshot();
    } catch (error) {
      userMessage.status = operations.signal?.aborted ? "cancelled" : "failed";
      userMessage.error = error.message;
      w.save();
      throw error;
    }
  },
`);
  range('  reconcile: async ({ id, remoteId }) => {', '\n};\napp.whenReady()', `  reconcile: payload => require("../core/reconcile.cjs").reconcile(w, payload, authService),`);
  r('      message: `Publicar a revisão atual de “${p.title}” no ${channel}?`,', '      message: `${p.publications[channel]?.remoteId && channel !== "instagram" ? "Atualizar o post existente com" : "Publicar"} a revisão atual de “${p.title}” no ${channel}?`,');
  r('      if (mutation && busy)\n        throw Error("Aguarde a operação atual ou cancele a geração.");\n      if (mutation) busy = true;', '      const operationId = mutation ? operations.begin(name, payload?.id, cancellable.has(name)) : null;');
  r('        if (mutation) busy = false;', '        if (operationId) operations.finish(operationId);');
  r('    if (busy) {', '    if (operations.snapshot()) {');
  r('          "Aguarde a operação atual antes de fechar. Você pode cancelar a geração.",', '          operations.snapshot()?.cancellable\n            ? "Há uma operação em andamento. Use Cancelar no aplicativo antes de fechar."\n            : "Há uma operação que precisa terminar antes de fechar o aplicativo.",');
  r('  if (!busy && w) {', '  if (!operations.snapshot() && w) {');
});
edit("src/types.ts", (r) => {
  r('\n  sources?: Project["sources"];', '\n  sources?: Project["sources"];\n  research?: { sessionId?: string; searches: { provider: ResearchProvider; query: string; count: number }[] };');
  r('    at: string;\n  }[];\n  runs:', '    at: string;\n    requestId?: string;\n    status?: string;\n    error?: string;\n    revisionId?: string;\n    reviewedChannels?: Channel[];\n    reviewFingerprint?: string;\n  }[];\n  reviewFeedback?: { status: "current" | "stale" | "legacy" | "none"; content?: string; revisionId?: string; channels?: Channel[]; at?: string };\n  runs:');
  r('    { status: string; remoteId?: string; url?: string }', '    { status: string; remoteId?: string; url?: string; revision?: string; title?: string; destination?: string; recoveryNote?: string }');
  r('  unlocked?: boolean;', '  operation?: { id: string; name: string; projectId: string | null; startedAt: string; cancellable: boolean; cancelRequested: boolean } | null;\n  unlocked?: boolean;');
});
edit("src/Studio.tsx", (r, range) => {
  r('import CardEditor, { CardPreviews } from "./CardEditor";', 'import CardEditor, { CardPreviews } from "./CardEditor";\nimport PublishDestinations from "./PublishDestinations";\nimport RevisionSources from "./RevisionSources";');
  r('  const p = state?.projects.find((p) => p.id === id),', '  const activeAction = useRef<symbol | null>(null);\n  const chatRequest = useRef<{ id: string; projectId: string; message: string } | null>(null);\n  const p = state?.projects.find((p) => p.id === id),');
  r('    busy = !!working;', '    busy = !!working || !!state?.operation;');
  range('  useEffect(() => {\n    if (!busy) return;', '  useEffect(() => {\n    const handler', `  useEffect(() => {
    if (!busy) return;
    let active = true;
    const refresh = () => api.state().then((value: State | null) => { if (active) setState(value); }).catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 1200);
    return () => { active = false; clearInterval(timer); };
  }, [busy]);
`);
  r('  async function act(name: string, payload?: any) {\n    setWorking(name);', '  async function act(name: string, payload?: any) {\n    if (name === "cancel") {\n      const operation = state?.operation;\n      if (!operation?.cancellable || operation.cancelRequested) return null;\n      try {\n        await api.cancel({ operationId: operation.id });\n        setState(await api.state());\n        return true;\n      } catch (error) { setNotice((error as Error).message); return null; }\n    }\n    if (activeAction.current) return null;\n    const actionId = Symbol(name);\n    activeAction.current = actionId;\n    setWorking(name);');
  r('    } finally {\n      setWorking("");\n    }\n  }', '    } finally {\n      if (activeAction.current === actionId) {\n        activeAction.current = null;\n        setWorking("");\n      }\n    }\n  }');
  range('  const reviewChannels = selected', '  return (\n    <div className="app desktop-studio">', `  const operation = state?.operation;
  const operationNames: Record<string, string> = { run: "Gerando conteúdo", chat: "Respondendo à conversa", rewrite: "Preparando reescrita", publish: "Enviando publicação", reconcile: "Verificando publicação", instagramConnect: "Conectando Instagram", wordpressConnect: "Conectando WordPress", bloggerConnect: "Conectando Blogger" };
`);
  r('        {notice && (', '        {busy && (\n          <div className="notice operation-status" role="status" aria-live="polite">\n            <span>{operation?.cancelRequested ? "Cancelando operação…" : operationNames[operation?.name || working] || "Operação em andamento…"}{operation?.projectId && ` · ${state?.projects.find(project => project.id === operation.projectId)?.title || "Pauta"}`}</span>\n            {operation?.cancellable && !(screen === "settings" && operation.name.endsWith("Connect")) && (\n              <button data-testid="cancel-operation" disabled={operation.cancelRequested} onClick={() => act("cancel")}>Cancelar</button>\n            )}\n          </div>\n        )}\n        {notice && (');
  r('                {busy && working !== "rewrite" ? (\n                  <button onClick={() => api.cancel()}>Cancelar</button>\n                ) : (', '                {!busy && (');
  r('                    <h2>Revisar e publicar</h2>', '                    <h2>Revisar e publicar</h2>\n                    <p className="small muted">Prévia da revisão atual salva{r ? ` (${p.revisions.length})` : ""}.</p>');
  r('                {["blog", "instagram"].includes(tab) && (', '                {["blog", "instagram", "sources"].includes(tab) && (');
  range('                {tab === "sources" && (', '                {tab === "chat" && (', '                {tab === "sources" && <RevisionSources project={p} revision={version ? p.revisions.find(item => item.id === version) : r} />}\n');
  r('                            <pre className="prose">{m.content}</pre>', '                            <pre className="prose">{m.content}</pre>\n                            {["cancelled", "failed"].includes(m.status || "") && <small>{m.status === "cancelled" ? "Resposta cancelada" : "Resposta não concluída"} · Sua mensagem foi preservada.</small>}');
  r('                        if (await act("chat", { id, message })) setMessage("");', '                        if (!chatRequest.current || chatRequest.current.projectId !== id || chatRequest.current.message !== message)\n                          chatRequest.current = { id: crypto.randomUUID(), projectId: id, message };\n                        if (await act("chat", { id, message, requestId: chatRequest.current.id })) { setMessage(""); chatRequest.current = null; }');
  range('                        <details className="review-feedback">', '                      </>\n                    ) : (', `                        <details className="review-feedback" data-review-status={p.reviewFeedback?.status || "none"}>
                          <summary>{p.reviewFeedback?.status === "current" ? "Revisão com IA desta versão" : p.reviewFeedback?.status === "stale" ? "Revisão anterior com IA — desatualizada" : p.reviewFeedback?.status === "legacy" ? "Revisão antiga — versão não identificada" : "Esta versão ainda não foi revisada pela IA"}</summary>
                          <p className="small muted">{p.reviewFeedback?.status === "current" ? "Avaliação vinculada a esta revisão. Canais conferidos: " + p.reviewFeedback.channels?.join(" e ") + "." : "As observações antigas não validam o conteúdo atual. A revisão e a aprovação manual continuam disponíveis."}</p>
                          {p.reviewFeedback?.content && <pre className="prose">{p.reviewFeedback.content}</pre>}
                        </details>
`);
  range('                    <div className="publish-destinations">', '                    {selected.includes("blog") &&', '                    {state && <PublishDestinations project={p} state={state} busy={busy} dirty={dirty} renderedRevision={renderedRevision} act={act} openSettings={() => leave(() => setScreen("settings"))} />}\n');
});
edit("src/RevisionSources.tsx", r => {
  r('session && session.revisionId !== revision?.id && !!session.artifacts?.sources', 'session && (!revision || session.revisionId !== revision.id) && !!session.artifacts?.sources');
});
const packageJSON = JSON.parse(fs.readFileSync("package.json", "utf8"));
packageJSON.scripts["test:p0-desktop"] = "electron tests/p0-desktop.cjs";
packageJSON.scripts["test:editorial-desktop"] = "electron tests/editorial-desktop.cjs && electron tests/p0-desktop.cjs";
fs.writeFileSync("package.json", JSON.stringify(packageJSON, null, 2) + "\n");
fs.appendFileSync("src/style.css", "\n/* Recovery belongs to its publication destination, not a separate screen. */\n.recovery-controls { grid-column: 2 / -1; min-width: 0; }\n.recovery-controls form { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }\n.recovery-controls label { flex: 1 1 240px; min-width: 0; }\n.approval-row > div:first-child { min-width: 0; overflow-wrap: anywhere; }\n.operation-status { display: flex; justify-content: space-between; align-items: center; gap: 12px; }\n@media (max-width: 850px) { .recovery-controls { grid-column: 1 / -1; } }\n");
edit("README.md", r => {
  r("A reconciliação WordPress por ID existe no IPC; sua interface dedicada e a retomada dos contêineres Instagram ainda estão pendentes.", "Cada destino permite verificar resultados incertos: WordPress e Blogger pelo ID do post, Instagram pelo contêiner ou ID da publicação. A verificação não reenvia conteúdo; resultados não confirmados permanecem bloqueados. Veja os detalhes e testes em [P0: fluxo editorial](docs/p0-validation.md).");
  r("Limites conhecidos da beta: melhorar reconciliação; acrescentar", "Limites conhecidos da beta: acrescentar");
});
console.log("P0 transformations applied.");
