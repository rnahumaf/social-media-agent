// P1 acceptance through the real Electron renderer and IPC. Fixtures only.
const { app, BrowserWindow, dialog, shell } = require("electron");
app.disableHardwareAcceleration();
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { Workspace, current } = require("../core/workspace.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "p1-desktop-"));
const dir = path.join(root, "workspace");
app.setPath("userData", path.join(root, "userdata"));
let chosen = dir,
  confirmations = 0,
  requests = [];
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
dialog.showMessageBox = async () => {
  confirmations++;
  return { response: 0 };
};
dialog.showMessageBoxSync = () => {
  throw Error("Saved drafts must not request discard confirmation");
};
shell.openExternal = async () => {};
global.fetch = async (url, options = {}) => {
  const u = new URL(url);
  assert.equal(
    u.hostname,
    "openrouter.ai",
    "P1 adaptation cannot search or publish externally",
  );
  const body = JSON.parse(options.body);
  requests.push(body);
  return Response.json({
    model: body.model,
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: body.response_format
            ? JSON.stringify({
                caption: "Legenda adaptada.",
                cards: [
                  {
                    title: "Primeira ideia",
                    body: "Conteúdo adaptado do artigo.",
                  },
                  { title: "Segunda ideia", body: "Sem nova pesquisa." },
                ],
              })
            : "Avaliação dos canais selecionados.",
        },
      },
    ],
    usage: { total_tokens: 123 },
  });
};
require("../electron/main.cjs");
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  win.hide();
  const evaluate = (code) =>
    win.webContents.executeJavaScript(code).catch((error) => {
      console.error("P1 renderer:", code);
      throw error;
    });
  const call = (name, payload) =>
    evaluate(
      `window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`,
    );
  const wait = async (fn, label = "condition") => {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw Error("P1 timeout: " + label);
  };
  const dom = (code) => wait(() => evaluate(code), code);
  const click = async (text) => {
    await evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(text)});if(b.length!==1||b[0].disabled)throw Error('Missing/enabled button: '+${JSON.stringify(text)});b[0].click();})()`,
    );
  };
  const fill = (selector, value) =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Field missing');Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  const fillCardText = async (label, value) => {
    await evaluate(
      `(()=>{const el=document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]');el.focus();const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);})()`,
    );
    await win.webContents.insertText(value);
  };
  const close = async () => {
    await evaluate(
      `document.querySelector('[aria-label="Fechar diálogo"]')?.click()`,
    );
    await dom(`!document.querySelector('[role=dialog]')`);
  };
  const tools = async () =>
    evaluate("document.querySelector('.context-tools').open=true");
  const capture = async (name) => {
    win.showInactive();
    await evaluate(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const dims = await evaluate(
      `({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>({width:el.clientWidth,scroll:el.scrollWidth}))})`,
    );
    assert.ok(dims.scroll <= dims.width + 1, JSON.stringify(dims));
    for (const item of dims.dialogs)
      assert.ok(item.scroll <= item.width + 1, JSON.stringify(dims));
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
    const second = seed.create("Outra pauta", "", "", {
      channels: ["blog"],
      manual: true,
    });
    const p = seed.create(
      "Fluxo P1",
      "Conteúdo de demonstração para testes.",
      "",
      { channels: ["blog", "instagram"], manual: true },
    );
    seed.revise(p.id, {
      article: "# Texto original\n\nTexto para adaptação.",
      caption: "Legenda salva",
      cards: [
        { title: "Um", body: "Primeiro card." },
        { title: "Dois", body: "Segundo card." },
      ],
      sources: [
        {
          id: "source",
          title: "Fonte original",
          abstract: "Evidência preservada.",
          access: "abstract",
          url: "https://example.test/evidence",
        },
      ],
    });
    Object.assign(seed.state.settings, {
      models: Object.fromEntries(
        ["writer", "social", "researcher", "reviewer"].map((r) => [
          r,
          "fixture",
        ]),
      ),
      wordpressUrl: "https://example.test",
      wordpressUser: "author",
    });
    seed.unlock("fixture-password-long", {
      openrouter: "fixture",
      wordpress: "fixture",
    });
    seed.save();
    seed.close();
    if (win.webContents.isLoading())
      await new Promise((r) => win.webContents.once("did-finish-load", r));
    await click("Escolher pasta de trabalho");
    await dom(`!!document.querySelector('[role=tablist]')`);
    await call("vault", { password: "fixture-password-long", remember: false });
    // Refresh runtime flags; production data never leaves the disposable workspace.
    const loaded = new Promise((r) =>
      win.webContents.once("did-finish-load", r),
    );
    win.webContents.reload();
    await loaded;
    await dom(`!!document.querySelector('[role=tablist]')`);
    assert.deepEqual(
      await evaluate(
        `[...document.querySelectorAll('[role=tab]')].map(el=>el.textContent)`,
      ),
      ["Blog", "Instagram"],
    );
    assert.equal(
      await evaluate(
        `[...document.querySelectorAll('.side-bottom > button')].map(el=>el.textContent).join(',')`,
      ),
      "Configurações",
    );
    assert.equal(
      await evaluate(
        `!!document.querySelector('select[aria-label="Canal a gerar"]')`,
      ),
      false,
    );
    const revisionCount = (await call("state")).projects[0].revisions.length;
    await click("Markdown");
    const draft =
      "# Rascunho automático\n\nEdição preservada sem criar uma revisão.";
    await fill('[aria-label="Artigo em Markdown"]', draft);
    // Navigate before the debounce fires. The destination must wait for the newest edit.
    await click("Configurações");
    await dom(`!!document.querySelector('.compact-settings')`);
    let state = await call("state");
    assert.equal(state.projects[0].draft.content.article, draft);
    assert.equal(state.projects[0].revisions.length, revisionCount);
    assert.equal(
      await evaluate(`document.querySelector('.knowledge-panel').open`),
      false,
    );
    assert.equal(
      await evaluate(
        `document.querySelectorAll('input[list="model-catalog"]').length`,
      ),
      1,
    );
    await fill('input[list="model-catalog"]', "single-default");
    await click("Salvar configurações");
    await dom(
      `document.querySelector('.compact-settings [role=status]')?.textContent==='Configurações salvas.'`,
    );
    assert.deepEqual(Object.values((await call("state")).settings.models), [
      "single-default",
      "single-default",
      "single-default",
      "single-default",
    ]);
    await capture("p1-settings");
    await evaluate(`document.querySelector('.projects button').click()`);
    await dom(`!!document.querySelector('[role=tablist]')`);
    await click("Markdown");
    assert.equal(
      await evaluate(
        `document.querySelector('[aria-label="Artigo em Markdown"]').value`,
      ),
      draft,
    );
    const reload = new Promise((r) =>
      win.webContents.once("did-finish-load", r),
    );
    win.webContents.reload();
    await reload;
    await dom(`!!document.querySelector('[role=tablist]')`);
    await click("Markdown");
    assert.equal(
      await evaluate(
        `document.querySelector('[aria-label="Artigo em Markdown"]').value`,
      ),
      draft,
    );
    // Draft export uses the latest autosave, without approval or a publication checkpoint.
    chosen = path.join(root, "export");
    fs.mkdirSync(chosen);
    await tools();
    await click("Exportar rascunho");
    await wait(
      () => fs.existsSync(path.join(chosen, "revisao.json")),
      "draft export",
    );
    assert.equal(
      fs.readFileSync(path.join(chosen, "artigo.md"), "utf8"),
      draft,
    );
    const exported = JSON.parse(
      fs.readFileSync(path.join(chosen, "revisao.json"), "utf8"),
    );
    assert.equal(exported.draft, true);
    assert.equal(exported.approval, undefined);
    assert.equal(
      (await call("state")).projects[0].revisions.length,
      revisionCount,
    );
    await dom(`!document.querySelector('.operation-status')`);
    await click("Briefing");
    await dom(`!!document.querySelector('.project-decisions')`);
    await evaluate(`document.querySelector('.project-decisions').open=true`);
    await fill(
      ".project-decisions label:nth-of-type(1) textarea",
      "Pessoas sem formação técnica",
    );
    await fill(
      ".project-decisions label:nth-of-type(3) textarea",
      "Uma tese que deve permanecer",
    );
    await click("Salvar pauta");
    await dom(`!document.querySelector('[role=dialog]')`);
    assert.equal(
      (await call("state")).projects[0].decisions.thesis,
      "Uma tese que deve permanecer",
    );
    await click("Gerar com IA");
    await dom(
      `document.querySelector('[role=dialog]')?.getAttribute('aria-label')==='Gerar conteúdo'`,
    );
    // Existing article defaults to reuse, and only Instagram is requested.
    await evaluate(
      `(()=>{const labels=[...document.querySelectorAll('[role=dialog] label')];labels.find(l=>l.textContent==='Blog').querySelector('input').click()})()`,
    );
    await capture("p1-adapt-dialog");
    await click("Adaptar material");
    await wait(
      async () =>
        (await call("state")).projects[0].sessions?.at(-1)?.status ===
        "completed",
      "adaptation",
    );
    await dom(`!document.querySelector('.operation-status')`);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].response_format.type, "json_schema");
    assert.ok(
      requests.every((body) =>
        body.messages.some((m) =>
          m.content.includes("Uma tese que deve permanecer"),
        ),
      ),
    );
    state = await call("state");
    assert.equal(current(state.projects[0]).article, draft);
    assert.equal(current(state.projects[0]).sources[0].id, "source");
    assert.equal(state.projects[0].sessions.at(-1).mode, "adapt");
    await click("Instagram");
    await dom(
      `document.querySelectorAll('.card-thumbnails img').length===2 && !!document.querySelector('.selected-card-preview img')`,
    );
    assert.equal(
      await evaluate(`document.querySelector('.appearance-panel').open`),
      false,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.card-thumbnails img').src===document.querySelector('.selected-card-preview img').src`,
      ),
      true,
    );
    chosen = path.join(root, "fixture.png");
    await require("sharp")({
      create: { width: 300, height: 200, channels: 3, background: "#999999" },
    })
      .png()
      .toFile(chosen);
    await click("Adicionar imagem");
    await dom(`!!document.querySelector('input[aria-label="Zoom da imagem"]')`);
    await fillCardText("Título do card", "Título ".repeat(12));
    await fillCardText("Texto do card", "Longo ".repeat(70));
    await dom(
      `!!document.querySelector('.card-thumbnails .card-render-error') && document.querySelectorAll('.card-thumbnails img').length===1`,
    );
    assert.match(
      await evaluate(`document.querySelector('.card-thumbnails img').alt`),
      /Card 2/,
    );
    await capture("p1-isolated-render-error");
    await fillCardText("Título do card", "Ideia clara");
    await fillCardText("Texto do card", "Texto que cabe.");
    await dom(
      `!document.querySelector('.card-render-error') && document.querySelectorAll('.card-thumbnails img').length===2`,
    );
    win.setContentSize(780, 640);
    await capture("p1-editor-780");
    await click("Publicar");
    await dom(`!!document.querySelector('[data-destination=wordpress]')`);
    assert.equal(
      await evaluate(
        `!![...document.querySelectorAll('[data-destination=wordpress] button')].find(b=>b.textContent==='Aprovar revisão')`,
      ),
      false,
    );
    const checkpoint = (await call("state")).projects[0].revisions.length;
    await click("Aprovar e publicar no WordPress");
    await dom(`!document.querySelector('.operation-status')`);
    assert.equal(confirmations, 1);
    assert.equal(requests.length, 2);
    assert.equal((await call("state")).projects[0].approval, null);
    assert.equal(
      (await call("state")).projects[0].revisions.length,
      checkpoint,
    );
    await dom(
      "document.querySelectorAll('.review-cards img').length===2 && [...document.querySelectorAll('.review-cards img')].every(img=>img.complete)",
    );
    await evaluate(
      "document.querySelector('.publish-destinations').scrollIntoView({block:'end'})",
    );
    await capture("p1-publish-780");
    await close();
    // Single-channel generation presents no redundant channel selector.
    await evaluate(
      `[...document.querySelectorAll('.projects button')].find(b=>b.textContent.includes('Outra pauta')).click()`,
    );
    await dom(
      `document.querySelector('.project-header h1')?.textContent==='Outra pauta'`,
    );
    await click("Criar com IA");
    await dom(`!!document.querySelector('[role=dialog]')`);
    assert.equal(
      await evaluate(`!!document.querySelector('[role=dialog] fieldset')`),
      false,
    );
    await close();
    // A persisted draft survives immediate native close without a new immutable revision.
    await click("Markdown");
    await fill('[aria-label="Artigo em Markdown"]', "# Fechamento imediato");
    app.removeAllListeners("window-all-closed");
    const closed = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("close flush timed out")),
        10000,
      );
      win.once("closed", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    win.close();
    await closed;
    const closingDraft = JSON.parse(
      fs.readFileSync(path.join(dir, "drafts", second.id + ".json"), "utf8"),
    );
    assert.equal(closingDraft.content.article, "# Fechamento imediato");
    console.log(
      "P1 desktop passed: minimal navigation, coalesced autosave, navigation/reload/close durability, default model, draft export, persistent decisions, two-call adaptation, shared preview, isolated invalid card, combined publishing confirmation, 780px layout.",
    );
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
