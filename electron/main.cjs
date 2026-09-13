const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  safeStorage,
} = require("electron");
const path = require("node:path"),
  fs = require("node:fs"),
  crypto = require("node:crypto");
const { Workspace, current, assertApproved } = require("../core/workspace.cjs");
const { run } = require("../core/pipeline.cjs");
const { chatInstruction } = require("../core/editorial-prompts.cjs");
const { svgCard } = require("../core/render.cjs");
const providers = require("../core/providers.cjs");
const publishers = require("../core/publish.cjs");
const { createRememberedVaults } = require("./remembered-vaults.cjs");
let win,
  w,
  busy = false,
  controller,
  rememberedVaults;
if (!app.requestSingleInstanceLock()) app.quit();
const instagramAuth = require("../core/instagram-auth.cjs");
const authService =
  process.env.STUDIO_AUTH_ORIGIN || require("../core/auth-config.json").origin;
const blogger = require("../core/blogger.cjs");
const actions = {
  instagramInvites: async () => {
    await shell.openExternal(
      "https://www.instagram.com/accounts/manage_access/",
    );
    return true;
  },
  bloggerConnect: async () => {
    if (!w.secrets) throw Error("Desbloqueie o cofre antes de conectar.");
    controller = new AbortController();
    const credential = await instagramAuth.connect({
      service: authService,
      provider: "blogger",
      openBrowser: (url) => shell.openExternal(url),
      signal: controller.signal,
    });
    const blogs = await blogger.blogs(credential.token);
    controller.signal.throwIfAborted();
    if (!blogs.length)
      throw Error(
        "Esta conta Google não administra blogs. Conecte a conta correta.",
      );
    w.storeSecret("blogger", JSON.stringify(credential));
    const selected = blogs.length === 1 ? blogs[0] : null;
    Object.assign(w.state.settings, {
      bloggerBlogs: blogs,
      bloggerId: selected?.id || "",
      bloggerUrl: selected?.url || "",
      bloggerName: selected?.name || "",
    });
    for (const p of w.state.projects) if (p.approval) delete p.approval.blogger;
    w.save();
    return w.snapshot();
  },
  bloggerSelect: async ({ id }) => {
    const blogs = await blogger.blogs(await blogger.access(w, authService));
    const selected = blogs.find((b) => b.id === id);
    if (!selected) throw Error("Escolha um blog autorizado pela conta Google.");
    Object.assign(w.state.settings, {
      bloggerBlogs: blogs,
      bloggerId: selected.id,
      bloggerUrl: selected.url,
      bloggerName: selected.name,
    });
    for (const p of w.state.projects) if (p.approval) delete p.approval.blogger;
    w.save();
    return w.snapshot();
  },
  bloggerTest: async () => {
    await blogger.verify(w, authService);
    return w.snapshot();
  },
  bloggerDisconnect: () => {
    w.storeSecret("blogger", null);
    Object.assign(w.state.settings, {
      bloggerBlogs: [],
      bloggerId: "",
      bloggerUrl: "",
      bloggerName: "",
    });
    for (const p of w.state.projects) if (p.approval) delete p.approval.blogger;
    w.save();
    return w.snapshot();
  },
  wordpressConnect: async () => {
    if (!w.secrets) throw Error("Desbloqueie o cofre antes de conectar.");
    controller = new AbortController();
    const site = await instagramAuth.connect({
      service: authService,
      provider: "wordpress",
      openBrowser: (url) => shell.openExternal(url),
      signal: controller.signal,
    });
    w.storeSecret("wordpressCom", site.token);
    Object.assign(w.state.settings, {
      wordpressProvider: "wordpress.com",
      wordpressSiteId: site.siteId,
      wordpressSiteName: site.siteName,
      wordpressUrl: site.siteUrl,
    });
    for (const p of w.state.projects)
      if (p.approval) delete p.approval.wordpress;
    w.save();
    return w.snapshot();
  },
  wordpressTest: async () => {
    if (!w.secrets?.wordpressCom)
      throw Error("Desbloqueie o cofre e conecte o WordPress.com.");
    const site = await require("../core/wordpress-auth.cjs").profile(
      w.secrets.wordpressCom,
      w.state.settings.wordpressSiteId,
      w.state.settings.wordpressUrl,
    );
    if (site.siteUrl !== w.state.settings.wordpressUrl)
      throw Error("O endereço do site mudou. Reconecte o WordPress.com.");
    return w.snapshot();
  },
  wordpressDisconnect: () => {
    w.storeSecret("wordpressCom", null);
    Object.assign(w.state.settings, {
      wordpressProvider: "selfhosted",
      wordpressUrl: "",
      wordpressSiteId: "",
      wordpressSiteName: "",
    });
    for (const p of w.state.projects)
      if (p.approval) delete p.approval.wordpress;
    w.save();
    return w.snapshot();
  },
  instagramConnect: async () => {
    if (!authService)
      throw Error(
        "A conexão Instagram ainda não foi habilitada nesta distribuição. O responsável pelo aplicativo precisa ativar o serviço de conexão.",
      );
    if (!w.secrets)
      throw Error("Desbloqueie o cofre antes de conectar o Instagram.");
    controller = new AbortController();
    const account = await instagramAuth.connect({
      service: authService,
      openBrowser: (url) => shell.openExternal(url),
      signal: controller.signal,
    });
    w.storeSecret("instagram", account.token);
    w.storeSecret("instagramMedia", account.mediaToken || null);
    w.state.settings.instagramAccount = account.id;
    w.state.settings.instagramUsername = account.username;
    w.state.settings.instagramExpiresAt = account.expiresAt;
    for (const p of w.state.projects)
      if (p.approval) delete p.approval.instagram;
    w.save();
    return w.snapshot();
  },
  instagramDisconnect: () => {
    w.storeSecret("instagram", null);
    w.storeSecret("instagramMedia", null);
    w.state.settings.instagramAccount = "";
    delete w.state.settings.instagramUsername;
    delete w.state.settings.instagramExpiresAt;
    for (const p of w.state.projects)
      if (p.approval) delete p.approval.instagram;
    w.save();
    return w.snapshot();
  },
  instagramTest: async () => {
    if (!w.secrets?.instagram)
      throw Error("Desbloqueie o cofre e conecte o Instagram.");
    const account = await instagramAuth.profile(
      w.secrets.instagram,
      w.state.settings.graphVersion,
    );
    if (account.id !== w.state.settings.instagramAccount)
      throw Error("A conta autorizada mudou. Reconecte o Instagram.");
    w.state.settings.instagramUsername = account.username;
    w.save();
    return w.snapshot();
  },
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
    w.vaultRemembered = rememberedVaults.has(dir);
    if (w.vaultRemembered) {
      let password = await rememberedVaults.load(dir);
      if (password) {
        try {
          w.unlock(password);
        } catch {
          rememberedVaults.forget(dir);
          w.vaultRemembered = false;
        } finally {
          password = null;
        }
      } else w.vaultRemembered = false;
    }
    for (const p of w.state.projects) {
      if (p.status === "running") p.status = "interrupted";
      for (const r of p.runs)
        if (r.status === "running") r.status = "interrupted";
      for (const session of p.sessions || [])
        if (session.status === "running") {
          session.status = "interrupted";
          session.error =
            "A execução foi interrompida quando o aplicativo foi fechado. Retome para continuar do último ponto salvo.";
          session.updatedAt = new Date().toISOString();
          session.events.push({
            id: crypto.randomUUID(),
            at: session.updatedAt,
            kind: "error",
            role: session.cursor === "search" ? "researcher" : session.cursor,
            title: "Execução interrompida",
            detail: session.error,
          });
        }
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
          before.settings.wordpressUser !== settings.wordpressUser ||
          before.settings.wordpressProvider !== settings.wordpressProvider ||
          before.settings.wordpressSiteId !== settings.wordpressSiteId
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
  vault: async ({ password = "", values, remember = true } = {}) => {
    if (w.secrets && !password) {
      for (const [name, value] of Object.entries(values || {}))
        if (
          ["openrouter", "wordpress"].includes(name) &&
          typeof value === "string" &&
          value
        )
          w.storeSecret(name, value);
    } else w.unlock(password, values);
    if (!remember) {
      rememberedVaults.forget(w.dir);
      w.vaultRemembered = false;
      delete w.vaultRememberError;
    } else if (password) {
      try {
        w.vaultRemembered = await rememberedVaults.save(w.dir, password);
        w.vaultRememberError = w.vaultRemembered
          ? undefined
          : "O armazenamento seguro do sistema não está disponível. O cofre continuará pedindo a senha ao abrir.";
      } catch {
        w.vaultRemembered = false;
        w.vaultRememberError =
          "O sistema não conseguiu proteger a senha neste computador. O cofre continuará pedindo a senha ao abrir.";
      }
    }
    return w.snapshot();
  },
  lock: () => {
    rememberedVaults.forget(w.dir);
    w.vaultRemembered = false;
    delete w.vaultRememberError;
    w.lockVault();
    return w.snapshot();
  },
  models: () => providers.models(),
  run: async ({ id, resume = false, instruction = "" }) => {
    controller = new AbortController();
    return run(w, id, {
      signal: controller.signal,
      resume: !!resume,
      instruction,
    });
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
            chatInstruction +
            "\n\nContexto editorial deste projeto:\n" +
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
    if (!["wordpress", "instagram", "blogger"].includes(channel))
      throw Error("Canal inválido.");
    const p = w.project(id);
    assertApproved(p, w.state.settings, channel);
    const confirmation = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Cancelar", "Publicar agora"],
      defaultId: 0,
      cancelId: 0,
      message: `Publicar a revisão atual de “${p.title}” no ${channel}?`,
      detail:
        channel === "blogger"
          ? "Destino: " + w.state.settings.bloggerUrl
          : "Esta ação enviará o conteúdo à conta configurada.",
    });
    if (confirmation.response === 1) {
      if (channel === "blogger") await blogger.publish(w, id, authService);
      else if (channel === "instagram")
        await publishers.instagram(w, id, urls, authService);
      else await publishers[channel](w, id, urls);
    }
    return w.snapshot();
  },
  reconcile: async ({ id, remoteId }) => {
    if (!/^\d+$/.test(remoteId))
      throw Error("Informe o ID numérico do post existente.");
    const p = w.project(id);
    if (p.publications.wordpress?.status !== "uncertain")
      throw Error("Não há publicação incerta para reconciliar.");
    const s = w.state.settings;
    const access = publishers.wordpressAccess(w);
    const post = await providers.request(access.base + "/posts/" + remoteId, {
      headers: { Authorization: access.authorization },
    });
    if (post.status !== "publish")
      throw Error("O post informado não está publicado.");
    p.publications.wordpress = {
      ...p.publications.wordpress,
      status: "reconciled",
      remoteId: post.id || post.ID,
      url: post.link || post.URL,
    };
    w.save();
    return w.snapshot();
  },
};
app.whenReady().then(() => {
  rememberedVaults = createRememberedVaults({
    file: path.join(app.getPath("userData"), "remembered-vaults.json"),
    safeStorage,
  });
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
