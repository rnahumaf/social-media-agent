// Real editor, native Electron rendering and IPC, using disposable fixtures only.
const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "rich-editor-ui-"));
const dir = path.join(root, "workspace");
app.disableHardwareAcceleration();
app.setPath("userData", path.join(root, "userdata"));
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
dialog.showMessageBox = async () => ({ response: 0 });
shell.openExternal = async () => {};
process.on("uncaughtException", (error) => {
  console.error(error);
  app.exit(1);
});
const timeout = setTimeout(() => {
  console.error("Rich editor acceptance timed out");
  app.exit(1);
}, 60000);
let releaseRewrite,
  rewriteCalls = 0,
  lastRewrite;
global.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const card = JSON.parse(body.messages.at(-1).content).text;
  if (++rewriteCalls > 1)
    card.bodyRich.content[0].content[0].content[0].content[0].marks.push({
      type: "italic",
    });
  lastRewrite = card;
  await new Promise((resolve) => {
    releaseRewrite = resolve;
  });
  return Response.json({
    model: "fixture",
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(card) } },
    ],
    usage: { total_tokens: 10 },
  });
};
require("../electron/main.cjs");
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  win.webContents.setBackgroundThrottling(false);
  win.hide();
  const evaluate = (code) => win.webContents.executeJavaScript(code);
  const call = (name, payload) =>
    evaluate(
      `window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`,
    );
  const wait = async (fn) => {
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      if (await fn()) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw Error("UI condition timed out: " + fn.toString());
  };
  const click = (text) =>
    evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable button: '+${JSON.stringify(text)});b.click()})()`,
    );
  const toolbar = (label, field = "texto") =>
    evaluate(
      `(()=>{const b=document.querySelector('[aria-label="Formatação do ${field} do card"] [aria-label="${label}"]');if(!b||b.disabled)throw Error('Unavailable control: ${label}');b.click()})()`,
    );
  const select = (selector) =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.closest('[contenteditable]').focus();const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);document.dispatchEvent(new Event('selectionchange'))})()`,
    );
  const field = '[aria-label="Texto do card"]';
  const reload = async () => {
    const ready = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.reload();
    await ready;
    await wait(() => evaluate(`!!document.querySelector('${field}')`));
  };
  const capture = async (name, width, height, zoom = 1) => {
    win.setContentSize(width, height);
    win.webContents.setZoomFactor(zoom);
    win.showInactive();
    await wait(() =>
      evaluate(
        "!!document.querySelector('.selected-card-preview img')?.complete",
      ),
    );
    await evaluate(
      "document.querySelector('.card-fields').scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    const overflow = await evaluate(
      "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || [...document.querySelectorAll('.card-rich-editor')].some(el=>el.scrollWidth>el.clientWidth+1)",
    );
    assert.equal(overflow, false, name + " overflow");
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
    if (win.webContents.isLoading())
      await new Promise((resolve) =>
        win.webContents.once("did-finish-load", resolve),
      );
    fs.mkdirSync(dir);
    await click("Escolher pasta de trabalho");
    await wait(() =>
      evaluate(
        "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Criar primeira pauta')",
      ),
    );
    await call("create", {
      title: "Texto rico nos cards",
      brief: "Fixture visual sem dados pessoais.",
      manual: true,
      channels: ["instagram"],
    });
    const state = await call("state"),
      p = state.projects[0],
      id = p.id;
    await call("edit", {
      id,
      content: {
        ...p.revisions.at(-1),
        caption: "Legenda da fixture.",
        cards: [
          {
            title: "Uma ideia por card",
            body: "Primeiro item.\nSegundo item.",
          },
          { title: "Outro card", body: "Parágrafo simples." },
        ],
      },
    });
    await reload();
    // Formatting-only transactions must reach autosave with unchanged plain text.
    await select(field);
    await toolbar("Negrito");
    await toolbar("Itálico");
    await toolbar("Sublinhado");
    await wait(() =>
      evaluate(
        `!!document.querySelector('${field} strong em u, ${field} strong u em')`,
      ),
    );
    await toolbar("Lista com marcadores");
    await wait(() =>
      evaluate(`document.querySelectorAll('${field} ul > li').length === 2`),
    );
    await select(`${field} li:nth-child(2) p`);
    await toolbar("Aumentar recuo");
    await wait(() => evaluate(`!!document.querySelector('${field} ul ul')`));
    await toolbar("Diminuir recuo");
    await wait(() => evaluate(`!document.querySelector('${field} ul ul')`));
    await toolbar("Lista numerada");
    await wait(() =>
      evaluate(`document.querySelectorAll('${field} ol > li').length === 2`),
    );
    const beforeUndo = await evaluate(
      `document.querySelector('${field}').innerHTML`,
    );
    await toolbar("Desfazer");
    await wait(
      async () =>
        (await evaluate(`document.querySelector('${field}').innerHTML`)) !==
        beforeUndo,
    );
    await toolbar("Refazer");
    await wait(
      async () =>
        (await evaluate(`document.querySelector('${field}').innerHTML`)) ===
        beforeUndo,
    );
    await select('[aria-label="Título do card"]');
    await toolbar("Itálico", "título");
    await wait(
      async () =>
        !!(await call("state")).projects[0].draft?.content.cards[0].titleRich,
    );
    let saved = (await call("state")).projects[0].draft.content.cards;
    assert.equal(saved[0].body, "Primeiro item.\nSegundo item.");
    assert.equal(saved[0].bodyRich.content[0].type, "orderedList");
    assert.equal(
      saved[0].bodyRich.content[0].content[0].content[0].content[0].marks
        .length,
      3,
    );
    await reload();
    await wait(() =>
      evaluate(`!!document.querySelector('${field} ol li strong')`),
    );
    await capture("rich-editor-1440", 1440, 940);
    await capture("rich-editor-780", 780, 640);
    await capture("rich-editor-780-zoom125", 780, 640, 1.25);
    win.webContents.setZoomFactor(1);
    win.setContentSize(1440, 940);
    // Compare the displayed preview with the production render of the saved draft.
    const draft = (await call("state")).projects[0].draft.content;
    const previews = await call("previewCards", draft);
    await wait(() =>
      evaluate(
        `document.querySelector('.selected-card-preview img')?.src === ${JSON.stringify(previews[0].image)}`,
      ),
    );
    if (process.env.STUDIO_CAPTURE_DIR)
      fs.writeFileSync(
        path.join(process.env.STUDIO_CAPTURE_DIR, "rich-card.jpg"),
        Buffer.from(previews[0].image.split(",")[1], "base64"),
      );
    // Paragraph indent, pasted formatting, overflow rejection and empty rich cards.
    await evaluate(
      "document.querySelector('[aria-label=\"Editar card 2\"]').click()",
    );
    await select(field);
    await toolbar("Aumentar recuo");
    await wait(() =>
      evaluate(
        `document.querySelector('${field} p')?.getAttribute('data-indent')==='1'`,
      ),
    );
    await toolbar("Diminuir recuo");
    await select(field);
    await evaluate(
      `(()=>{const dt=new DataTransfer();dt.setData('text/html','<p><strong>Colado</strong> <em>em itálico</em> <u>e sublinhado</u>.</p><ul><li>Lista colada.</li></ul>');document.querySelector('${field}').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:dt}))})()`,
    );
    await wait(() =>
      evaluate(
        `!!document.querySelector('${field} ul li') && !!document.querySelector('${field} u')`,
      ),
    );
    const beforeLongPaste = await evaluate(
      `document.querySelector('${field}').textContent`,
    );
    await select(field);
    await win.webContents.insertText("x".repeat(421));
    await wait(() =>
      evaluate("!!document.querySelector('.card-text-field [role=alert]')"),
    );
    assert.equal(
      await evaluate(`document.querySelector('${field}').textContent`),
      beforeLongPaste,
    );
    await select(field);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
    await wait(() =>
      evaluate(`document.querySelector('${field}').textContent === ''`),
    );
    await select('[aria-label="Título do card"]');
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Backspace" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Backspace" });
    await wait(
      async () =>
        (await call("state")).projects[0].draft?.content.cards[1].body === "",
    );
    await wait(() =>
      evaluate(
        "!!document.querySelector('.selected-card-preview img')?.complete && !document.querySelector('.card-render-error')",
      ),
    );
    // Copying/reordering retains the complete formatted document.
    await evaluate(
      "document.querySelector('[aria-label=\"Editar card 1\"]').click()",
    );
    await wait(() =>
      evaluate(
        "document.querySelector('.card-fields h3')?.textContent === 'Card 1'",
      ),
    );
    await evaluate(
      "document.querySelector('[aria-label=\"Duplicar card\"]').click()",
    );
    await wait(() =>
      evaluate(
        "document.querySelectorAll('.card-thumbnails button').length===3",
      ),
    );
    await evaluate(
      "document.querySelector('[aria-label=\"Mover card para baixo\"]').click()",
    );
    await wait(
      async () =>
        (await call("state")).projects[0].draft?.content.cards[2]?.title ===
        saved[0].title,
    );
    assert.deepEqual(
      (await call("state")).projects[0].draft.content.cards[2],
      saved[0],
    );
    // A format-only edit while AI is responding invalidates that suggestion.
    await call("vault", {
      password: "fixture-password-long",
      values: { openrouter: "fixture-key" },
      remember: false,
    });
    const settings = (await call("state")).settings;
    await call("settings", {
      settings: {
        ...settings,
        models: { ...settings.models, social: "fixture" },
      },
    });
    await reload();
    await click("Reescrever card com IA");
    await click("Solicitar sugestão");
    await wait(() => !!releaseRewrite);
    await select(field);
    await toolbar("Itálico");
    releaseRewrite();
    await wait(() =>
      evaluate(
        "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Aplicar sugestão')",
      ),
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Aplicar sugestão').disabled",
      ),
      true,
    );
    await click("Descartar sugestão");
    releaseRewrite = undefined;
    await click("Reescrever card com IA");
    await click("Solicitar sugestão");
    await wait(() => !!releaseRewrite);
    releaseRewrite();
    await wait(() =>
      evaluate(
        "[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Aplicar sugestão' && !b.disabled)",
      ),
    );
    await click("Aplicar sugestão");
    await wait(() =>
      evaluate(
        "!document.querySelector('[role=dialog]') && document.querySelector('[data-testid=draft-status]')?.textContent === 'Revisão salva'",
      ),
    );
    assert.deepEqual(
      (await call("state")).projects[0].revisions.at(-1).cards[0],
      lastRewrite,
    );
    await evaluate("document.querySelector('.context-tools').open=true");
    await click("Histórico");
    await evaluate(
      "(()=>{const el=document.querySelector('[aria-label=\"Revisão exibida\"]');el.value=el.options[el.options.length-1].value;el.dispatchEvent(new Event('change',{bubbles:true}))})()",
    );
    await wait(() =>
      evaluate(
        "[...document.querySelectorAll('.card-text-input')].every(el=>el.getAttribute('contenteditable')==='false')",
      ),
    );
    assert.equal(
      await evaluate(
        "[...document.querySelectorAll('.card-rich-editor button')].every(b=>b.disabled)",
      ),
      true,
    );
    await click("Voltar ao rascunho");
    console.log(
      "Rich editor desktop passed: manual formatting, lists, indentation, undo/redo, paste, autosave/reload, JPEG preview, empty/overflow states, duplicate/reorder, rewrite race, 1440/780 and 125% zoom.",
    );
    clearTimeout(timeout);
    app.quit();
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
app.on("will-quit", () => {
  fs.rmSync(dir, { recursive: true, force: true });
});
