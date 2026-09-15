// Real Electron renderer + IPC. All content, credentials and images are disposable fixtures.
const { app, BrowserWindow, dialog, shell } = require("electron");
app.disableHardwareAcceleration();
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-ui-"));
const workspace = path.join(root, "workspace");
fs.mkdirSync(workspace);
app.setPath("userData", path.join(root, "user-data"));
let chosen = workspace,
  releaseRewrite;
let holdRewrite = false;
let closePrompts = 0;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
dialog.showMessageBox = async () => ({ response: 0 });
dialog.showMessageBoxSync = () => {
  closePrompts++;
  return 0;
};
shell.openExternal = async () => {};
global.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, "openrouter.ai");
  const body = JSON.parse(options.body);
  if (holdRewrite) await new Promise((resolve) => (releaseRewrite = resolve));
  return Response.json({
    model: "fixture",
    choices: [
      {
        message: {
          content: body.response_format
            ? JSON.stringify({
                title: "Título revisto",
                body: "Texto do card revisto.",
              })
            : "# Texto revisado\n\nParágrafo revisto sem conteúdo do Instagram.",
        },
      },
    ],
    usage: { total_tokens: 10 },
  });
};
require("../electron/main.cjs");
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.hide();
  const evaluate = (code) =>
    win.webContents.executeJavaScript(code).catch((error) => {
      console.error("Failed renderer evaluation:", code);
      throw error;
    });
  const call = (name, payload) =>
    evaluate(
      `window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`,
    );
  const wait = async (code) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (await evaluate(code)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error("UI condition failed: " + code);
  };
  const click = async (text) => {
    await evaluate(
      `(()=>{const found=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()===${JSON.stringify(text)});if(found.length!==1)throw Error('Button not unique: '+${JSON.stringify(text)});if(found[0].disabled)throw Error('Button disabled: '+${JSON.stringify(text)});found[0].click();})()`,
    );
  };
  const fill = async (selector, value) => {
    await evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Field missing');const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.blur();})()`,
    );
  };
  const reload = async () => {
    const loaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.webContents.reload();
    await loaded;
    await wait("!!document.querySelector('[role=tablist]')");
  };
  const capture = async (name) => {
    win.showInactive();
    await wait(
      "!document.querySelector('.card-placeholder') && [...document.querySelectorAll('.card-thumbnails img,.selected-card-preview img,.review-cards img')].every(img=>img.complete)",
    );
    await evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    const dims = await evaluate(
      "({width:document.documentElement.clientWidth,height:innerHeight,scroll:document.documentElement.scrollWidth})",
    );
    assert.ok(
      dims.scroll <= dims.width + 1,
      `Horizontal overflow in ${name}: ${JSON.stringify(dims)}`,
    );
    if (process.env.STUDIO_CAPTURE_DIR) {
      // Windows can discard a hidden window's compositor surface (UnknownVizError).
      win.showInactive();
      await evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      fs.mkdirSync(process.env.STUDIO_CAPTURE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(process.env.STUDIO_CAPTURE_DIR, name + ".png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.hide();
    }
    win.hide();
  };
  try {
    if (win.webContents.isLoading())
      await new Promise((resolve) =>
        win.webContents.once("did-finish-load", resolve),
      );
    await click("Escolher pasta de trabalho");
    await wait(
      "[...document.querySelectorAll('button')].some(b=>b.textContent==='Criar primeira pauta')",
    );
    await click("Criar primeira pauta");
    await wait("!!document.querySelector('[role=dialog]')");
    assert.equal(
      await evaluate("document.querySelector('input[name=creation]').checked"),
      true,
    );
    await fill(
      '[role=dialog] input[maxlength="180"]',
      "Publicação manual do autor",
    );
    await fill(
      "[role=dialog] textarea",
      "Conteúdo fictício para aceite desktop.",
    );
    await evaluate(
      "(()=>{const labels=[...document.querySelectorAll('[role=dialog] label')];for(const text of ['Blog','Instagram','Escrever manualmente']) labels.find(l=>l.textContent===text).querySelector('input').click();})()",
    );
    await click("Começar a escrever");
    await wait("!!document.querySelector('[role=tablist]')");
    let state = await call("state");
    assert.equal(state.unlocked, false);
    assert.notEqual(state.openrouterConfigured, true);
    assert.equal(state.projects[0].runs.length, 0);
    await capture("manual-empty");
    const id = state.projects[0].id;
    const article =
      "# Artigo do autor\n\nTexto **original**, com acentos e [referência](https://example.test/fonte).\n\n## Seção do artigo\n\nUma explicação que pertence apenas ao blog.";
    state = await call("edit", {
      id,
      content: {
        ...state.projects[0].revisions[0],
        article,
        caption: "Legenda exclusiva do Instagram.",
        cards: [
          {
            title: "Uma ideia por card",
            body: "Texto que acompanha a imagem do autor.",
          },
          {
            title: "Segundo card",
            body: "Outra parte da sequência editorial.",
          },
        ],
      },
    });
    await reload();
    await wait(
      "document.querySelector('[aria-label=\"Texto do blog\"]')?.textContent.includes('Artigo do autor')",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.editor-tools [role=status]').textContent",
      ),
      "Revisão salva",
    );
    assert.equal(
      (await call("state")).projects[0].revisions.at(-1).article,
      article,
    );
    win.setContentSize(1440, 940);
    await capture("blog-1440");
    await click("Markdown");
    await fill(
      '[aria-label="Artigo em Markdown"]',
      article + "\n\nEdição manual persistida.",
    );
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Alterações não salvas'",
    );
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    await reload();
    assert.match(
      (await call("state")).projects[0].revisions.at(-1).article,
      /Edição manual persistida/,
    );
    await evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Texto do blog\"]');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(range);})()",
    );
    await win.webContents.insertText(" Escrita no editor visual.");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Alterações não salvas'",
    );
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    assert.match(
      (await call("state")).projects[0].revisions.at(-1).article,
      /Escrita no editor visual/,
    );
    const supported = (await call("state")).projects[0].revisions.at(-1);
    const legacy =
      supported.article +
      "\n\n| Coluna | Valor |\n| --- | --- |\n| Texto | Preservado |\n\n- [x] Tarefa antiga";
    await call("edit", { id, content: { ...supported, article: legacy } });
    await reload();
    assert.equal(
      await evaluate(
        "document.querySelector('[aria-label=\"Artigo em Markdown\"]').value",
      ),
      legacy,
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('button')].find(b=>b.textContent==='Visual').disabled",
      ),
      true,
    );
    assert.equal(
      (await call("state")).projects[0].revisions.at(-1).article,
      legacy,
    );
    await call("edit", { id, content: supported });
    await reload();
    await call("vault", {
      password: "fixture-password-long",
      values: { openrouter: "fixture-key" },
      remember: false,
    });
    state = await call("state");
    await call("settings", {
      settings: {
        ...state.settings,
        models: {
          writer: "fixture",
          social: "fixture",
          researcher: "fixture",
          reviewer: "fixture",
        },
      },
    });
    await reload();
    holdRewrite = true;
    await click("Reescrever artigo com IA");
    await wait(
      "document.querySelector('[role=dialog]')?.contains(document.activeElement)",
    );
    await evaluate(
      "document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}))",
    );
    assert.equal(
      await evaluate("document.activeElement.textContent"),
      "Solicitar sugestão",
    );
    await click("Solicitar sugestão");
    await wait("!document.querySelector('[role=dialog]')");
    await evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Texto do blog\"]');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);})()",
    );
    await win.webContents.insertText(" Edição durante a reescrita.");
    while (!releaseRewrite)
      await new Promise((resolve) => setTimeout(resolve, 25));
    holdRewrite = false;
    releaseRewrite();
    await wait(
      "document.querySelector('[role=dialog]')?.textContent.includes('Sugestão de reescrita')",
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('button')].find(b=>b.textContent==='Aplicar sugestão').disabled",
      ),
      true,
    );
    await click("Descartar sugestão");
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    await click("Reescrever artigo com IA");
    await click("Solicitar sugestão");
    await wait(
      "document.querySelector('[role=dialog]')?.textContent.includes('Sugestão de reescrita')",
    );
    await capture("rewrite-dialog");
    await click("Aplicar sugestão");
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    assert.match(
      (await call("state")).projects[0].revisions.at(-1).article,
      /Texto revisado/,
    );
    assert.equal(
      (await call("state")).projects[0].revisions.at(-1).caption,
      "Legenda exclusiva do Instagram.",
    );
    await click("Instagram");
    await wait("!!document.querySelector('.card-fields')");
    chosen = path.join(root, "fixture.png");
    await require("sharp")({
      create: { width: 800, height: 600, channels: 3, background: "#527b9d" },
    })
      .png()
      .toFile(chosen);
    await click("Adicionar imagem");
    await wait(
      "!!document.querySelector('input[aria-label=\"Zoom da imagem\"]')",
    );
    await fill('[aria-label="Cor de fundo"]', "#e8eef4");
    await fill('[aria-label="Tamanho da fonte"]', "1.15");
    await fill('[aria-label="Zoom da imagem"]', "1.5");
    await fill('[aria-label="Horizontal da imagem"]', "25");
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    state = await call("state");
    assert.match(
      state.projects[0].revisions.at(-1).cards[0].image.path,
      /^assets\//,
    );
    assert.equal(
      state.projects[0].revisions.at(-1).style.background,
      "#e8eef4",
    );
    assert.equal(state.projects[0].revisions.at(-1).style.fontScale, 1.15);
    assert.equal(state.projects[0].revisions.at(-1).cards[0].image.zoom, 1.5);
    await wait(
      "document.querySelector('.selected-card-preview img')?.complete",
    );
    await capture("instagram-1440");
    await evaluate(
      "document.querySelector('[aria-label=\"Duplicar card\"]').click()",
    );
    await wait(
      "document.querySelectorAll('.card-thumbnails button').length===3",
    );
    await evaluate(
      "document.querySelector('[aria-label=\"Mover card para baixo\"]').click()",
    );
    await wait(
      "document.querySelector('.card-fields h3').textContent==='Card 3'",
    );
    await evaluate(
      "document.querySelector('[aria-label=\"Remover card\"]').click()",
    );
    await wait(
      "document.querySelectorAll('.card-thumbnails button').length===2",
    );
    await click("Salvar revisão");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Revisão salva'",
    );
    await click("Conhecimento");
    await wait("!!document.querySelector('.knowledge-panel')");
    await fill(
      ".knowledge-panel textarea",
      "Prefiro explicações concretas e parágrafos curtos.",
    );
    await click("Salvar conhecimento");
    await wait(
      "document.querySelector('.knowledge-panel [role=status]')?.textContent==='Conhecimento salvo.'",
    );
    assert.match(
      (await call("state")).knowledge.general,
      /explicações concretas/,
    );
    await click("Modelos e conexões");
    await wait("!!document.querySelector('.research-settings')");
    await evaluate(
      "[...document.querySelectorAll('.research-settings label')].find(l=>l.textContent==='PubMed').querySelector('input').click()",
    );
    await click("Salvar ferramentas de pesquisa");
    await wait("!document.querySelector('.research-settings button').disabled");
    assert.deepEqual((await call("state")).settings.research, ["web"]);
    await click("Salvar configurações");
    await wait(
      "![...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar configurações').disabled",
    );
    assert.deepEqual((await call("state")).settings.research, ["web"]);
    await evaluate("document.querySelector('.projects button').click()");
    await wait("!!document.querySelector('[role=tablist]')");
    await click("Revisar e publicar");
    await wait("!!document.querySelector('.review-content .blog-preview')");
    assert.ok(
      await evaluate(
        "document.querySelector('.review-content').textContent.includes('Legenda exclusiva do Instagram.')",
      ),
    );
    win.setContentSize(780, 640);
    await capture("review-780");
    await click("Blog");
    await capture("blog-780");
    win.webContents.setZoomFactor(1.25);
    await capture("blog-780-zoom125");
    await click("Instagram");
    await capture("instagram-780-zoom125");
    await evaluate(
      "document.querySelector('.style-editor').scrollIntoView({block:'center'})",
    );
    await capture("instagram-fields-780-zoom125");
    win.webContents.setZoomFactor(1);
    await capture("instagram-780");
    await click("Revisar e publicar");
    await evaluate(
      "document.querySelector('.publish-destinations').scrollIntoView({block:'center'})",
    );
    await capture("publish-780");
    await click("Blog");
    await evaluate("window.scrollTo(0,0)");
    win.setContentSize(1440, 940);
    win.webContents.setZoomFactor(1.25);
    await capture("blog-zoom125");
    win.webContents.setZoomFactor(1);
    chosen = path.join(root, "backup");
    fs.mkdirSync(chosen);
    await call("backup");
    await call("open");
    await reload();
    state = await call("state");
    assert.match(state.knowledge.general, /explicações concretas/);
    assert.match(
      state.projects[0].revisions.at(-1).cards[0].image.path,
      /^assets\//,
    );
    const before = state.projects[0].revisions.length;
    await assert.rejects(
      call("edit", {
        id,
        baseRevisionId: "outdated",
        content: state.projects[0].revisions.at(-1),
      }),
      /revisão mudou/,
    );
    assert.equal((await call("state")).projects[0].revisions.length, before);
    await click("Markdown");
    await fill('[aria-label="Artigo em Markdown"]', "# Rascunho não salvo");
    await wait(
      "document.querySelector('.editor-tools [role=status]').textContent==='Alterações não salvas'",
    );
    const closePrevented = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Unsaved-close dialog was not shown")),
        10000,
      );
      win.webContents.once("will-prevent-unload", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    win.close();
    await closePrevented;
    assert.equal(closePrompts, 1);
    assert.equal((await call("state")).projects[0].revisions.length, before);
    console.log(
      "Editorial desktop acceptance passed: manual + visual editing, rewrite races, images/styles, cards, knowledge, selected previews, portable backup, 780×640 and 1440×940 with 125% zoom.",
    );
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
app.on("will-quit", () => {
  const workspacePath = path.join(root, "workspace");
  if (fs.existsSync(workspacePath))
    fs.rmSync(workspacePath, { recursive: true, force: true });
});
