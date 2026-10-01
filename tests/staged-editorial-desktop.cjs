// Real Electron UI and IPC; all data and provider replies are disposable fixtures.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { Workspace, current } = require("../core/workspace.cjs");
const providers = require("../core/providers.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "staged-editorial-"));
const dir = path.join(root, "workspace");
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "userdata"));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
const requests = [];
const source = {
  id: "fixture",
  pmid: "123",
  title: "Fonte de teste",
  abstract: "Dados de teste.",
  access: "abstract",
  url: "https://example.test/source",
};
providers.pubmed = async () => [source];
global.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, "openrouter.ai");
  const body = JSON.parse(options.body);
  requests.push(body);
  const content =
    body.model === "researcher"
      ? body.messages.at(-1).content.includes("allowedProviders")
        ? '{"provider":"pubmed","query":"fixture"}'
        : "Dossiê de teste"
      : body.model === "writer"
        ? "# Artigo gerado\n\nTexto para revisão humana."
        : body.model === "social"
          ? JSON.stringify({
              caption: "Legenda adaptada",
              cards: [
                { title: "Um", body: "Card um" },
                { title: "Dois", body: "Card dois" },
              ],
            })
          : "Conferência de teste";
  return Response.json({
    model: body.model,
    choices: [{ finish_reason: "stop", message: { content } }],
    usage: { total_tokens: 12 },
  });
};
require("../electron/main.cjs");
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.hide();
  win.webContents.setBackgroundThrottling(false);
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  const call = (name, payload) =>
    evaluate(
      `window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`,
    );
  const wait = async (code) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error("Timed out: " + code);
  };
  const click = (text) =>
    evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(text)});if(b.length!==1||b[0].disabled)throw Error('Missing enabled button');b[0].click()})()`,
    );
  const closeDialog = async () => {
    await evaluate(
      `document.querySelector('[aria-label="Fechar diálogo"]').click()`,
    );
    await wait(`!document.querySelector('[role=dialog]')`);
  };
  const capture = async (name) => {
    win.showInactive();
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth<=document.documentElement.clientWidth+1",
      ),
      true,
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('[role=dialog]')].every(el=>el.scrollWidth<=el.clientWidth+1)",
      ),
      true,
    );
    if (process.env.STUDIO_CAPTURE_DIR) {
      fs.mkdirSync(process.env.STUDIO_CAPTURE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(process.env.STUDIO_CAPTURE_DIR, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
    }
    win.hide();
  };
  try {
    const seed = await Workspace.open(dir);
    const p = seed.create("Pauta em duas etapas", "Briefing de teste", "", {
      manual: true,
      channels: ["instagram", "blog"],
    });
    seed.state.settings.models = Object.fromEntries(
      ["researcher", "writer", "social", "reviewer"].map((role) => [
        role,
        role,
      ]),
    );
    seed.state.settings.research = ["pubmed"];
    seed.unlock("fixture-password-long", { openrouter: "fixture" });
    seed.save();
    seed.close();
    if (win.webContents.isLoading())
      await new Promise((resolve) =>
        win.webContents.once("did-finish-load", resolve),
      );
    await click("Escolher pasta de trabalho");
    await wait(`!!document.querySelector('[role=tablist]')`);
    await call("vault", { password: "fixture-password-long", remember: false });
    const loaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.webContents.reload();
    await loaded;
    await wait(`!!document.querySelector('[role=tablist]')`);
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Adaptar para Instagram').disabled`,
      ),
      true,
    );
    await click("Criar com IA");
    await wait(`!!document.querySelector('[role=dialog]')`);
    assert.equal(
      await evaluate(
        `document.querySelector('input[name="generation-target"]:checked').parentElement.textContent`,
      ),
      "Blog",
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('input[name="generation-target"]:checked').length`,
      ),
      1,
    );
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('input[name="generation-target"]')].find(el=>el.parentElement.textContent==='Instagram').disabled`,
      ),
      true,
    );
    await capture("staged-blog-dialog");
    await click("Pesquisar e criar");
    await wait(
      `!document.querySelector('.operation-status') && !document.querySelector('[role=dialog]') && [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Gerar com IA')`,
    );
    let state = await call("state");
    let project = state.projects.find((item) => item.id === p.id);
    assert.deepEqual(
      requests.map((body) => body.model),
      ["researcher", "researcher", "writer", "reviewer"],
    );
    assert.equal(current(project).cards.length, 0);
    assert.equal(current(project).caption, "");
    assert.deepEqual(project.sessions.at(-1).channels, ["blog"]);
    assert.equal(project.sessions.at(-1).status, "completed");
    assert.equal(
      await evaluate(
        `document.querySelector('[role=tab][aria-selected=true]').textContent`,
      ),
      "Blog",
    );
    await click("Markdown");
    const edited =
      "# Artigo revisado pela autora\n\nDecisão editorial que precisa chegar ao carrossel.";
    await evaluate(
      `(()=>{const el=document.querySelector('[aria-label="Artigo em Markdown"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(edited)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
    );
    // Start adaptation immediately, before autosave's debounce can complete.
    await click("Adaptar para Instagram");
    await wait(
      `document.querySelector('[role=dialog]')?.getAttribute('aria-label')==='Adaptar para Instagram'`,
    );
    assert.equal(
      await evaluate(
        `!!document.querySelector('[role=dialog] input[name="generation-target"]')`,
      ),
      false,
    );
    win.setContentSize(780, 640);
    await capture("staged-instagram-dialog-780");
    await click("Gerar carrossel e legenda");
    await wait(
      `!document.querySelector('.operation-status') && document.querySelector('[role=tab][aria-selected=true]')?.textContent==='Instagram'`,
    );
    assert.deepEqual(
      requests.slice(4).map((body) => body.model),
      ["social", "reviewer"],
    );
    assert.equal(
      JSON.parse(requests[4].messages.at(-1).content).article,
      edited,
    );
    assert.equal(
      JSON.parse(requests[5].messages.at(-1).content).sourceArticle,
      edited,
    );
    state = await call("state");
    project = state.projects.find((item) => item.id === p.id);
    assert.equal(current(project).article, edited);
    assert.deepEqual(current(project).sources, [
      { ...source, provider: "pubmed" },
    ]);
    assert.equal(current(project).cards.length, 2);
    assert.equal(project.revisions.at(-2).article, edited);
    assert.equal(project.revisions.at(-2).cards.length, 0);
    assert.equal(project.approval, null);
    assert.deepEqual(project.sessions.at(-1).channels, ["instagram"]);
    await capture("staged-instagram-editor-780");
    await click("Adaptar para Instagram");
    await wait(
      `document.querySelector('[role=dialog]')?.textContent.includes('substituirá os cards')`,
    );
    await capture("staged-replace-dialog-780");
    await closeDialog();
    // Pautas apenas de Instagram retain generation directly from the briefing.
    await call("create", {
      title: "Instagram direto",
      brief: "Teste",
      channels: ["instagram"],
      manual: true,
    });
    const reloaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.webContents.reload();
    await reloaded;
    await wait(
      `document.querySelector('.project-header h1')?.textContent==='Instagram direto'`,
    );
    await click("Criar com IA");
    await wait(`!!document.querySelector('[role=dialog]')`);
    assert.equal(
      await evaluate(`!!document.querySelector('[role=dialog] fieldset')`),
      false,
    );
    await click("Pesquisar e criar");
    await wait(
      `!document.querySelector('.operation-status') && !document.querySelector('[role=dialog]')`,
    );
    assert.deepEqual(
      requests.slice(6).map((body) => body.model),
      ["researcher", "researcher", "social", "reviewer"],
    );
    console.log(
      "Staged editorial desktop passed: blog-only first stage, human edits saved before adaptation, article/source preservation, fidelity review, history, Instagram-only research and 780px dialogs.",
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
