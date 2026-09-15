// P0 acceptance: real Electron + IPC, isolated fixtures, no live provider calls.
const { app, BrowserWindow, dialog, shell } = require("electron");
app.disableHardwareAcceleration();
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), assert = require("node:assert/strict");
const { Workspace, current } = require("../core/workspace.cjs");
const { reviewFingerprint } = require("../core/provenance.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "p0-desktop-"));
const dir = path.join(root, "workspace");
app.setPath("userData", path.join(root, "user-data"));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => 0;
shell.openExternal = async () => {};
let releaseRecovery, attemptedHTML, llmCalls = 0, postCalls = 0;
global.fetch = async (url, options = {}) => {
  const u = new URL(url);
  if (u.hostname === "openrouter.ai") {
    llmCalls++;
    return new Promise((resolve, reject) => {
      const abort = () => reject(options.signal.reason);
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    });
  }
  if (u.hostname === "example.test") {
    if (options.method && options.method !== "GET") { postCalls++; throw Error("Unexpected publication from a recovery check"); }
    return new Promise(resolve => { releaseRecovery = () => resolve(Response.json({ id: 77, status: "publish", title: { raw: "Pauta P0" }, content: { raw: attemptedHTML }, link: "https://example.test/post" })); });
  }
  throw Error("Unexpected network access in P0 test: " + url);
};
require("../electron/main.cjs");
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const evaluate = code => win.webContents.executeJavaScript(code);
  const call = (name, payload) => evaluate(`window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`);
  const wait = async (condition, label = "condition") => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (await condition()) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw Error("P0 timeout: " + label);
  };
  const dom = code => wait(() => evaluate(code), code);
  const click = async text => evaluate(`(() => { const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === ${JSON.stringify(text)}); if (buttons.length !== 1 || buttons[0].disabled) throw Error('Missing or disabled button: ' + ${JSON.stringify(text)}); buttons[0].click(); })()`);
  const fill = async (selector, value) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Missing field'); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  const reload = async () => {
    const loaded = new Promise(resolve => win.webContents.once("did-finish-load", resolve));
    win.webContents.reload(); await loaded; await dom("!!document.querySelector('[role=tablist]')");
  };
  try {
    const seed = await Workspace.open(dir);
    const p = seed.create("Pauta P0", "Teste editorial", "", { channels: ["blog", "instagram"], manual: true });
    const oldSource = { title: "Fonte da revisão", pmid: "1", abstract: "Original", access: "abstract", url: "https://example.test/old" };
    const newSource = { title: "Pesquisa posterior", pmid: "2", abstract: "Nova", access: "abstract", url: "https://example.test/new" };
    const first = seed.revise(p.id, { article: "# Artigo original\n\nTexto.", caption: "Legenda", cards: [{ title: "A", body: "B" }, { title: "C", body: "D" }], sources: [oldSource] });
    p.messages.push({ role: "assistant", agent: "reviewer", content: "Avaliação antiga.", revisionId: first.id, reviewedChannels: ["blog", "instagram"], reviewFingerprint: reviewFingerprint(p, first, ["blog", "instagram"]), at: new Date().toISOString() });
    seed.revise(p.id, { ...first, article: "# Artigo editado\n\nTexto novo." });
    p.sources = [newSource];
    p.sessions = [{ id: "pending", status: "paused", cursor: "writer", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [], artifacts: { sources: [newSource], searches: [{ provider: "pubmed", query: "new evidence", count: 1 }] } }];
    Object.assign(seed.state.settings, { models: { writer: "fixture", social: "fixture", researcher: "fixture", reviewer: "fixture" }, wordpressUrl: "https://example.test", wordpressUser: "author", instagramAccount: "456", instagramUsername: "fixture" });
    p.publications.wordpress = { status: "uncertain", revision: first.id, remoteId: "77", title: p.title, destination: "https://example.test" };
    p.publications.instagram = { status: "published", revision: first.id, destination: "456" };
    seed.save(); seed.close();
    attemptedHTML = (await import("../core/blog-html.mjs")).renderBlog(first.article);
    if (win.webContents.isLoading()) await new Promise(resolve => win.webContents.once("did-finish-load", resolve));
    await click("Escolher pasta de trabalho");
    await dom("!!document.querySelector('[role=tablist]')");
    await call("vault", { password: "fixture-password-long", values: { openrouter: "fixture", wordpress: "fixture" }, remember: false });
    await reload();
    await click("Revisar e publicar");
    await dom("!!document.querySelector('[data-destination=wordpress] form')");
    assert.equal(await evaluate("document.querySelector('.review-feedback').dataset.reviewStatus"), "stale");
    assert.equal(await evaluate("[...document.querySelectorAll('[data-destination=instagram] button')].some(b=>b.textContent.includes('Publicar'))"), false);
    assert.ok(await evaluate("document.querySelector('[data-destination=instagram]').textContent.includes('anterior')"));
    win.setContentSize(780, 640);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"));
    await click("Verificar resultado");
    await wait(async () => (await call("state")).operation?.name === "reconcile", "recovery operation");
    const recovery = (await call("state")).operation;
    assert.equal(recovery.cancellable, false);
    assert.equal(await evaluate("!!document.querySelector('[data-testid=cancel-operation]')"), false);
    await assert.rejects(call("cancel", { operationId: recovery.id }), /não pode/);
    await wait(() => !!releaseRecovery, "recovery fixture"); releaseRecovery();
    await dom("[...document.querySelectorAll('[data-destination=wordpress] button')].some(b=>b.textContent.trim()==='Atualizar no WordPress')");
    assert.equal(postCalls, 0);
    let state = await call("state");
    assert.equal(state.projects[0].publications.wordpress.revision, first.id);
    assert.notEqual(state.projects[0].publications.wordpress.revision, state.projects[0].revisions.at(-1).id);
    await click("Fontes");
    await dom("!!document.querySelector('.pending-research')");
    assert.equal(await evaluate("document.querySelector('.content-pad > .source h3').textContent"), "Fonte da revisão");
    assert.equal(await evaluate("document.querySelector('.pending-research .source h3').textContent"), "Pesquisa posterior");
    await click("Conversa");
    await fill('[aria-label="Mensagem"]', "Pedido cancelável");
    await evaluate("document.querySelector('.chat form').requestSubmit()");
    await dom("!!document.querySelector('[data-testid=cancel-operation]:not(:disabled)')");
    const chat = (await call("state")).operation;
    assert.equal(chat.name, "chat");
    await click("Cancelar");
    await dom("!document.querySelector('.operation-status')");
    state = await call("state");
    assert.equal(state.operation, null);
    assert.equal(state.projects[0].messages.filter(m => m.content === "Pedido cancelável").length, 1);
    assert.equal(state.projects[0].messages.find(m => m.content === "Pedido cancelável").status, "cancelled");
    // Retry the same input without duplicating the saved user message.
    await evaluate("document.querySelector('.chat form').requestSubmit()");
    await dom("!!document.querySelector('[data-testid=cancel-operation]:not(:disabled)')");
    const next = (await call("state")).operation;
    assert.notEqual(next.id, chat.id);
    await assert.rejects(call("cancel", { operationId: chat.id }), /já terminou/);
    assert.equal((await call("state")).operation.cancelRequested, false);
    await click("Cancelar"); await dom("!document.querySelector('.operation-status')");
    assert.equal((await call("state")).projects[0].messages.filter(m => m.content === "Pedido cancelável").length, 1);
    await click("Blog");
    await click("Reescrever artigo com IA");
    await click("Solicitar sugestão");
    await dom("!!document.querySelector('[data-testid=cancel-operation]:not(:disabled)')");
    assert.equal((await call("state")).operation.name, "rewrite");
    await click("Markdown");
    await fill('[aria-label="Artigo em Markdown"]', "# Edição durante reescrita");
    await click("Cancelar"); await dom("!document.querySelector('.operation-status')");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Artigo em Markdown\"]').value"), "# Edição durante reescrita");
    assert.equal(await evaluate("!!document.querySelector('[role=dialog]')"), false);
    state = await call("state");
    assert.equal(state.projects[0].runs.at(-1).status, "cancelled");
    assert.equal(llmCalls, 3);
    await click("Salvar revisão");
    await dom("document.querySelector('.editor-tools [role=status]').textContent === 'Revisão salva'");
    console.log("P0 desktop passed: recovery without publishing, update state, immutable Instagram, revision-bound sources/reviews, noncancellable actions, cancellation identity, chat retry, editable rewrite cancellation, 780px layout.");
    win.destroy(); app.quit();
  } catch (error) { console.error(error); app.exit(1); }
});
