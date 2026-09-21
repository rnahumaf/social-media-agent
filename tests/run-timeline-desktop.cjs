// Timeline acceptance with actual persisted pipeline transitions and gated providers.
const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict");
const { Workspace } = require("../core/workspace.cjs");
const providers = require("../core/providers.cjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-ui-")),
  dir = path.join(root, "workspace");
const baseline = process.argv.includes("--baseline");
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
  console.error("Timeline acceptance timed out");
  app.exit(1);
}, 60000);
let stage,
  release,
  failSocial = true;
providers.pubmed = async () => [
  {
    pmid: "123",
    title: "Fonte de teste",
    abstract: "Resumo fictício",
    access: "abstract",
    url: "https://example.test/source",
  },
];
providers.complete = async (input) => {
  stage = input.system.includes("Escolha uma das ferramentas")
    ? "search"
    : input.model;
  await new Promise((resolve, reject) => {
    release = resolve;
    input.signal?.addEventListener("abort", () => reject(input.signal.reason), {
      once: true,
    });
  });
  if (stage === "social" && failSocial) {
    failSocial = false;
    throw Error("Falha de teste na criação do carrossel.");
  }
  return {
    model: input.model,
    usage: { total_tokens: 12 },
    content:
      stage === "search"
        ? '{"provider":"pubmed","query":"fixture"}'
        : stage === "social"
          ? JSON.stringify({
              caption: "Legenda fictícia",
              cards: [
                { title: "Primeiro card", body: "Texto fictício." },
                { title: "Segundo card", body: "Outro texto fictício." },
              ],
            })
          : stage === "writer"
            ? "# Artigo fictício\n\nTexto da fixture."
            : "Resultado fictício.",
  };
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
    const end = Date.now() + 12000;
    while (Date.now() < end) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw Error("Timeline condition timed out: " + fn.toString());
  };
  const click = (text) =>
    evaluate(
      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Unavailable: '+${JSON.stringify(text)});b.click()})()`,
    );
  const checkStage = async (key, count = 5) => {
    await wait(() => stage === key);
    await wait(() =>
      evaluate("!!document.querySelector('.run-activity.running')"),
    );
    if (baseline) return;
    await wait(() =>
      evaluate(
        `document.querySelector('.run-timeline [aria-current="step"]')?.getAttribute('data-step') === '${key}'`,
      ),
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.run-timeline > li').length"),
      count,
    );
    assert.equal(
      await evaluate(
        "document.querySelectorAll('.run-timeline .active').length",
      ),
      1,
    );
  };
  const capture = async (name, width, height, zoom = 1) => {
    win.setContentSize(width, height);
    win.webContents.setZoomFactor(zoom);
    win.showInactive();
    await evaluate(
      "document.querySelector('.run-activity').scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
    );
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1",
      ),
      false,
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
    seed.create("Acompanhar a produção", "Fixture de geração editorial", "", {
      manual: true,
      channels: ["blog", "instagram"],
      research: ["pubmed"],
    });
    seed.state.settings.models = {
      researcher: "researcher",
      writer: "writer",
      social: "social",
      reviewer: "reviewer",
    };
    seed.unlock("fixture-password-long", { openrouter: "fixture" });
    seed.save();
    seed.close();
    if (win.webContents.isLoading())
      await new Promise((r) => win.webContents.once("did-finish-load", r));
    await click("Escolher pasta de trabalho");
    await wait(() => evaluate("!!document.querySelector('[role=tablist]')"));
    await call("vault", { password: "fixture-password-long", remember: false });
    const ready = new Promise((r) =>
      win.webContents.once("did-finish-load", r),
    );
    win.reload();
    await ready;
    await wait(() => evaluate("!!document.querySelector('[role=tablist]')"));
    await click("Criar com IA");
    await click("Pesquisar e criar");
    for (const key of ["search", "researcher", "writer", "social"]) {
      await checkStage(key);
      if (key === "writer") {
        await capture("timeline-running-1440", 1440, 940);
        await capture("timeline-running-780", 780, 640);
        await capture("timeline-running-780-zoom125", 780, 640, 1.25);
      }
      release();
    }
    await wait(() =>
      evaluate("!!document.querySelector('.run-activity.paused')"),
    );
    if (!baseline) {
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.run-timeline .complete').length",
        ),
        3,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('.run-timeline .paused')?.getAttribute('data-step')",
        ),
        "social",
      );
      assert.equal(
        await evaluate("!!document.querySelector('.run-timeline .active')"),
        false,
      );
    }
    await capture("timeline-paused-780", 780, 640);
    stage = "";
    await click("Tentar novamente");
    await checkStage("social");
    release();
    await checkStage("reviewer");
    release();
    await wait(() =>
      evaluate("!!document.querySelector('.run-activity.completed')"),
    );
    if (!baseline)
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.run-timeline .complete').length",
        ),
        5,
      );
    await capture("timeline-completed-1440", 1440, 940);
    // Adaptation has only the selected channel and review; cancellation stops animation.
    await click("Gerar com IA");
    await evaluate(
      "[...document.querySelectorAll('[role=dialog] label')].find(l=>l.textContent.trim()==='Blog').querySelector('input').click()",
    );
    stage = "";
    await click("Adaptar material");
    await checkStage("social", 2);
    await evaluate(
      "document.querySelector('[data-testid=cancel-operation]').click()",
    );
    await wait(() =>
      evaluate("!!document.querySelector('.run-activity.cancelled')"),
    );
    if (!baseline)
      assert.equal(
        await evaluate(
          "document.querySelectorAll('.run-timeline .active').length",
        ),
        0,
      );
    console.log(
      "Timeline desktop passed: live search/evidence/blog/Instagram/review, pause/resume, completion, channel-specific adaptation, cancellation, 1440/780 and 125% zoom.",
    );
    clearTimeout(timeout);
    app.quit();
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
app.on("will-quit", () => fs.rmSync(dir, { recursive: true, force: true }));
