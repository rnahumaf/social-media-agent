const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("node:path"),
  fs = require("node:fs");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const { svgCard } = require("../core/render.cjs");
const providers = require("../core/providers.cjs");
const publishers = require("../core/publish.cjs");
let win,
  w,
  busy = false,
  controller;
if (!app.requestSingleInstanceLock()) app.quit();
const actions = {
  render: async ({ cards }) => {
    if (!Array.isArray(cards) || cards.length > 10)
      throw Error("Cards inválidos.");
    const sharp = require("sharp");
    return Promise.all(
      cards.map(
        async (c, i) =>
          "data:image/jpeg;base64," +
          (
            await sharp(Buffer.from(svgCard(c, i, cards.length)))
              .jpeg({ quality: 95 })
              .toBuffer()
          ).toString("base64"),
      ),
    );
  },
  state: () => w?.snapshot() || null,
  open: async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Criar ou abrir workspace",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return w?.snapshot() || null;
    const dir = result.filePaths[0];
    if (w?.dir === dir) return w.snapshot();
    const next = await Workspace.open(dir);
    w?.close();
    w = next;
    for (const p of w.state.projects) {
      if (p.status === "running") p.status = "interrupted";
      for (const r of p.runs)
        if (r.status === "running") r.status = "interrupted";
      for (const v of Object.values(p.publications))
        if (v.status === "sending") v.status = "uncertain";
    }
    w.save();
    return w.snapshot();
  },
  create: ({ title, brief, query }) => {
    w.create(title, brief, query);
    return w.snapshot();
  },
  update: ({ id, ...fields }) => {
    w.update(id, fields);
    return w.snapshot();
  },
  settings: ({ settings, memory }) => {
    const before = structuredClone(w.state);
    try {
      w.state.settings = { ...w.state.settings, ...settings };
      w.state.memory = memory;
      for (const p of w.state.projects) {
        if (
          before.settings.wordpressUrl !== settings.wordpressUrl ||
          before.settings.wordpressUser !== settings.wordpressUser
        )
          if (p.approval) delete p.approval.wordpress;
        if (
          before.settings.instagramAccount !== settings.instagramAccount ||
          before.settings.graphVersion !== settings.graphVersion
        )
          if (p.approval) delete p.approval.instagram;
      }
      w.save();
    } catch (e) {
      w.state = before;
      throw e;
    }
    return w.snapshot();
  },
  vault: ({ password, values }) => w.unlock(password, values),
  lock: () => {
    w.secrets = null;
    return w.snapshot();
  },
  models: () => providers.models(),
  run: async ({ id }) => {
    controller = new AbortController();
    return run(w, id, { signal: controller.signal });
  },
  cancel: () => {
    controller?.abort();
    return true;
  },
  edit: ({ id, content }) => {
    w.revise(id, content);
    return w.snapshot();
  },
  approve: ({ id, channel }) => {
    w.approve(id, channel);
    return w.snapshot();
  },
  chat: async ({ id, message }) => {
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 10000
    )
      throw Error("Mensagem inválida.");
    const p = w.project(id);
    p.messages.push({
      role: "user",
      content: message,
      at: new Date().toISOString(),
    });
    w.save();
    const result = w.state.settings.demo
      ? {
          content:
            "Sua orientação ficou registrada neste projeto. Ao gerar uma nova versão, os agentes receberão as mensagens recentes. Este modo demonstra o fluxo sem chamar modelos.",
        }
      : await providers.complete({
          key: w.secrets?.openrouter,
          model: w.state.settings.models.writer,
          system:
            "Você é um assistente editorial. Responda à conversa em PT-BR. Não altere arquivos nem afirme ter publicado. Contexto: " +
            JSON.stringify({
              brief: p.brief,
              revision: current(p),
              memory: w.state.memory,
            }),
          messages: p.messages
            .filter((m) => !m.internal && !m.agent)
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
        });
    p.messages.push({
      role: "assistant",
      content: result.content,
      at: new Date().toISOString(),
      usage: result.usage,
    });
    w.save();
    return w.snapshot();
  },
  backup: async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Escolher pasta vazia para cópia portável",
      properties: ["openDirectory", "createDirectory"],
    });
    if (!result.canceled) w.backup(result.filePaths[0]);
    return !result.canceled;
  },
  export: async ({ id }) => {
    const p = w.project(id);
    assertApproved(p, w.state.settings, "export");
    const result = await dialog.showOpenDialog(win, {
      title: "Exportar materiais para pasta vazia",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return false;
    const dir = result.filePaths[0];
    if (fs.readdirSync(dir).length) throw Error("Escolha uma pasta vazia.");
    const r = current(p);
    const sharp = require("sharp");
    const rendered = await Promise.all(
      r.cards.map((c, i) =>
        sharp(Buffer.from(svgCard(c, i, r.cards.length)))
          .jpeg({ quality: 95 })
          .toBuffer(),
      ),
    );
    fs.writeFileSync(path.join(dir, "artigo.md"), r.article);
    fs.writeFileSync(path.join(dir, "legenda.txt"), r.caption);
    fs.writeFileSync(
      path.join(dir, "revisao.json"),
      JSON.stringify(
        { revision: r, sources: r.sources || p.sources, approval: p.approval },
        null,
        2,
      ),
    );
    rendered.forEach((buffer, i) =>
      fs.writeFileSync(path.join(dir, `card-${i + 1}.jpg`), buffer),
    );
    return true;
  },
  publish: async ({ id, channel, urls }) => {
    if (!["wordpress", "instagram"].includes(channel))
      throw Error("Canal inválido.");
    const p = w.project(id);
    assertApproved(p, w.state.settings, channel);
    const confirmation = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Cancelar", "Publicar agora"],
      defaultId: 0,
      cancelId: 0,
      message: `Publicar a revisão atual de “${p.title}” no ${channel}?`,
      detail: "Esta ação enviará o conteúdo à conta configurada.",
    });
    if (confirmation.response === 1) await publishers[channel](w, id, urls);
    return w.snapshot();
  },
  reconcile: async ({ id, remoteId }) => {
    if (!/^\d+$/.test(remoteId))
      throw Error("Informe o ID numérico do post existente.");
    const p = w.project(id);
    if (p.publications.wordpress?.status !== "uncertain")
      throw Error("Não há publicação incerta para reconciliar.");
    const s = w.state.settings;
    const post = await providers.request(
      publishers.httpsBase(s.wordpressUrl) + "/wp-json/wp/v2/posts/" + remoteId,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(s.wordpressUser + ":" + w.secrets?.wordpress).toString(
              "base64",
            ),
        },
      },
    );
    if (post.status !== "publish")
      throw Error("O post informado não está publicado.");
    p.publications.wordpress = {
      ...p.publications.wordpress,
      status: "reconciled",
      remoteId: post.id,
      url: post.link,
    };
    w.save();
    return w.snapshot();
  },
};
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 780,
    minHeight: 640,
    title: "Social Media Agent · Alfa",
    backgroundColor: "#f7f8f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  for (const [name, action] of Object.entries(actions))
    ipcMain.handle("studio:" + name, async (event, payload) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw Error("Origem inválida.");
      if (!["open", "state", "cancel", "models"].includes(name) && !w)
        throw Error("Abra um workspace.");
      const mutation = !["state", "cancel", "models", "render"].includes(name);
      if (mutation && busy)
        throw Error("Aguarde a operação atual ou cancele a geração.");
      if (mutation) busy = true;
      try {
        return await action(payload);
      } catch (e) {
        throw Error(e.message || "Operação não concluída.");
      } finally {
        if (mutation) busy = false;
      }
    });
  win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.on("close", (event) => {
    if (busy) {
      event.preventDefault();
      dialog.showMessageBox(win, {
        message:
          "Aguarde a operação atual antes de fechar. Você pode cancelar a geração.",
      });
    }
  });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  if (!busy && w) {
    w.close();
    w = null;
  }
});
