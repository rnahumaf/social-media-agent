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
const { renderJPEGs } = require("../core/render.cjs");
const editorial = require("../core/editorial-model.cjs");
const testMode = !app.isPackaged && process.env.STUDIO_TEST_MODE === "1";
const providers = require("../core/providers.cjs");
const publishers = require("../core/publish.cjs");
const { createRememberedVaults } = require("./remembered-vaults.cjs");
let win, w, rememberedVaults;
const { OperationManager } = require("../core/operations.cjs");
const operations = new OperationManager();
const cancellable = new Set([
  "run",
  "chat",
  "rewrite",
  "instagramConnect",
  "wordpressConnect",
  "bloggerConnect",
]);
if (!app.requestSingleInstanceLock()) app.quit();
const instagramAuth = require("../core/instagram-auth.cjs");
const authService =
  process.env.STUDIO_AUTH_ORIGIN || require("../core/auth-config.json").origin;
const blogger = require("../core/blogger.cjs");
let closingApproved = false;
const actions = {
  bloggerConnect: async () => {
    if (!w.secrets) throw Error("Desbloqueie o cofre antes de conectar.");
    const credential = await instagramAuth.connect({
      service: authService,
      provider: "blogger",
      openBrowser: (url) => shell.openExternal(url),
      signal: operations.signal,
    });
    const blogs = await blogger.blogs(credential.token, operations.signal);
    operations.signal.throwIfAborted();
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
    const site = await instagramAuth.connect({
      service: authService,
      provider: "wordpress",
      openBrowser: (url) => shell.openExternal(url),
      signal: operations.signal,
    });
    operations.signal?.throwIfAborted();
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
    const account = await instagramAuth.connect({
      service: authService,
      openBrowser: (url) => shell.openExternal(url),
      signal: operations.signal,
    });
    operations.signal?.throwIfAborted();
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
  previewCards: ({ cards, style }) =>
    require("../core/render.cjs").previewCards(w.dir, cards, style),
  draft: (payload) => {
    const active = operations.snapshot();
    if (
      active?.projectId === payload.id &&
      !["rewrite", "chat"].includes(active.name)
    )
      throw Error(
        "O conteúdo está em uso. O rascunho será salvo quando a operação terminar.",
      );
    return w.saveDraft(payload);
  },
  finishClose: () => {
    closingApproved = true;
    setImmediate(() => win.close());
    return true;
  },
  render: async ({ cards, style }) => {
    if (!Array.isArray(cards) || cards.length > 10)
      throw Error("Cards inválidos.");
    const shown = cards.map((card) =>
      !card.title?.trim() && !card.body?.trim() && !card.image
        ? {
            ...card,
            title: "Seu próximo card",
            body: "Escreva o texto ou adicione uma imagem.",
            titleRich: null,
            bodyRich: null,
          }
        : card,
    );
    return (await renderJPEGs(w.dir, shown, style)).map(
      (bytes) => "data:image/jpeg;base64," + bytes.toString("base64"),
    );
  },
  importImage: async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Adicionar imagem ao card",
      properties: ["openFile"],
      filters: [
        { name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] },
      ],
    });
    if (result.canceled) return null;
    return require("../core/assets.cjs").importImage(
      w.dir,
      result.filePaths[0],
    );
  },
  knowledge: ({ knowledge }) => {
    w.state.knowledge = editorial.knowledgeSchema.parse(knowledge);
    w.state.memory = w.state.knowledge.general;
    w.save();
    return w.snapshot();
  },
  rewrite: async (payload) => {
    return require("../core/rewrite.cjs").rewrite(
      w,
      payload,
      operations.signal,
    );
  },
  state: () =>
    w ? { ...w.snapshot(), operation: operations.snapshot() } : null,
  open: async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Criar ou abrir workspace",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return w?.snapshot() || null;
    const dir = result.filePaths[0];
    if (w?.dir === dir) return w.snapshot();
    const next = await Workspace.open(dir, { testMode });
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
  create: ({ title, brief, query, channels, research, manual, decisions }) => {
    if (!testMode) editorial.channelsSchema.parse(channels);
    w.create(title, brief, query, { channels, research, manual, decisions });
    return w.snapshot();
  },
  update: ({ id, ...fields }) => {
    w.update(id, fields);
    return w.snapshot();
  },
  settings: ({ settings, memory }) => {
    const before = structuredClone(w.state);
    try {
      w.state.settings = {
        ...w.state.settings,
        ...settings,
        demo: testMode && !!settings.demo,
      };
      if (memory !== undefined) {
        w.state.memory = memory;
        w.state.knowledge.general = memory;
      }
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
  run: async ({
    id,
    resume = false,
    instruction = "",
    targets,
    mode = "research",
  }) => {
    return run(w, id, {
      signal: operations.signal,
      resume: !!resume,
      instruction,
      targets,
      mode,
    });
  },
  cancel: ({ operationId } = {}) => operations.cancel(operationId),
  edit: ({ id, content, baseRevisionId }) => {
    const previous = current(w.project(id));
    if (baseRevisionId !== undefined && previous?.id !== baseRevisionId)
      throw Error("A revisão mudou. Reabra a versão atual antes de salvar.");
    w.revise(id, { ...content, demo: !!previous?.demo, origin: "manual" });
    return w.snapshot();
  },
  approve: async ({ id, channel }) => {
    await w.approve(id, channel);
    return w.snapshot();
  },
  chat: async ({ id, message, requestId = crypto.randomUUID() }) => {
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 10000 ||
      typeof requestId !== "string" ||
      requestId.length > 100
    )
      throw Error("Mensagem inválida.");
    const p = w.project(id);
    let userMessage = p.messages.find(
      (m) => m.role === "user" && m.requestId === requestId,
    );
    if (userMessage && userMessage.content !== message)
      throw Error("Este envio pertence a outra mensagem.");
    if (userMessage?.status === "completed") return w.snapshot();
    if (!userMessage) {
      userMessage = {
        role: "user",
        content: message,
        requestId,
        at: new Date().toISOString(),
      };
      p.messages.push(userMessage);
    }
    userMessage.status = "sending";
    delete userMessage.error;
    w.save();
    try {
      const result =
        testMode && w.state.settings.demo
          ? {
              content:
                "Sua orientação ficou registrada. Ao gerar uma revisão, os agentes receberão as mensagens recentes.",
            }
          : await providers.complete({
              key: w.secrets?.openrouter,
              model:
                w.state.settings.models[
                  editorial.channels(p).includes("blog") ? "writer" : "social"
                ],
              signal: operations.signal,
              system:
                chatInstruction +
                "\n\nContexto editorial deste projeto:\n" +
                JSON.stringify({
                  brief: p.brief,
                  decisions: require("../core/context.cjs").decisions(p),
                  revision: (() => {
                    const saved = current(p);
                    const draft = require("../core/drafts.cjs").readDraft(
                      w,
                      p.id,
                    );
                    return draft?.baseRevisionId === (saved?.id || null)
                      ? { ...saved, ...draft.content, workingDraft: true }
                      : saved;
                  })(),
                  memory: editorial.knowledgeFor(
                    w.state,
                    editorial.channels(p).includes("blog")
                      ? "writer"
                      : "social",
                  ),
                }),
              messages: [
                ...require("../core/context.cjs").history(
                  p.messages.filter((m) => m !== userMessage),
                  "chat",
                  message,
                ),
                { role: "user", content: message },
              ],
              maxTokens: 2000,
            });
      operations.signal?.throwIfAborted();
      userMessage.status = "completed";
      p.messages.push({
        role: "assistant",
        content: result.content,
        at: new Date().toISOString(),
        usage: result.usage,
        requestId,
      });
      w.save();
      return w.snapshot();
    } catch (error) {
      userMessage.status = operations.signal?.aborted ? "cancelled" : "failed";
      userMessage.error = error.message;
      w.save();
      throw error;
    }
  },
  backup: async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Escolher pasta vazia para cópia portável",
      properties: ["openDirectory", "createDirectory"],
    });
    if (!result.canceled) w.backup(result.filePaths[0]);
    return !result.canceled;
  },
  export: async ({ id, draft: exportDraft = false }) => {
    const p = w.project(id);
    if (!exportDraft) assertApproved(p, w.state.settings, "export");
    const result = await dialog.showOpenDialog(win, {
      title: "Exportar materiais para pasta vazia",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled) return false;
    const dir = result.filePaths[0];
    if (fs.readdirSync(dir).length) throw Error("Escolha uma pasta vazia.");
    const savedDraft = exportDraft
      ? require("../core/drafts.cjs").readDraft(w, id)
      : null;
    if (savedDraft && savedDraft.baseRevisionId !== (current(p)?.id || null))
      throw Error(
        "O rascunho pertence a outra revisão. Recupere-o pelo Histórico antes de exportar.",
      );
    const r = savedDraft
      ? { ...current(p), ...savedDraft.content }
      : current(p);
    if (!r) throw Error("Escreva algum conteúdo antes de exportar.");
    const selected = editorial.channels(p);
    const rendered = selected.includes("instagram")
      ? exportDraft
        ? await renderJPEGs(w.dir, r.cards, r.style)
        : await publishers.approvedImages(w, p, r)
      : [];
    if (selected.includes("blog"))
      fs.writeFileSync(path.join(dir, "artigo.md"), r.article);
    if (selected.includes("instagram"))
      fs.writeFileSync(path.join(dir, "legenda.txt"), r.caption);
    fs.writeFileSync(
      path.join(dir, "revisao.json"),
      JSON.stringify(
        {
          title: p.title,
          channels: selected,
          revision: {
            id: r.id,
            createdAt: r.createdAt,
            origin: r.origin,
            demo: r.demo,
            ...(selected.includes("blog") ? { article: r.article } : {}),
            ...(selected.includes("instagram")
              ? { caption: r.caption, cards: r.cards, style: r.style }
              : {}),
          },
          sources: r.sources || p.sources,
          draft: !!exportDraft,
          approval: exportDraft ? undefined : p.approval?.export,
        },
        null,
        2,
      ),
    );
    rendered.forEach((buffer, i) =>
      fs.writeFileSync(path.join(dir, `card-${i + 1}.jpg`), buffer),
    );
    return true;
  },
  publish: async ({
    id,
    channel,
    urls,
    approveCurrent = false,
    baseRevisionId,
  }) => {
    if (!["wordpress", "instagram", "blogger"].includes(channel))
      throw Error("Canal inválido.");
    const p = w.project(id);
    if (approveCurrent) {
      if (!baseRevisionId || current(p)?.id !== baseRevisionId)
        throw Error(
          "A revisão mudou. Confira o conteúdo novamente antes de publicar.",
        );
    } else assertApproved(p, w.state.settings, channel);
    const confirmation = await dialog.showMessageBox(win, {
      type: "question",
      buttons: [
        "Cancelar",
        p.publications[channel]?.remoteId && channel !== "instagram"
          ? "Atualizar agora"
          : "Publicar agora",
      ],
      defaultId: 0,
      cancelId: 0,
      message: `${p.publications[channel]?.remoteId && channel !== "instagram" ? "Atualizar o post existente com" : "Publicar"} a revisão atual de “${p.title}” no ${channel}?`,
      detail:
        channel === "blogger"
          ? "Destino: " + w.state.settings.bloggerUrl
          : "Esta ação enviará o conteúdo à conta configurada.",
    });
    if (confirmation.response === 1) {
      if (approveCurrent) await w.approve(id, channel);
      if (channel === "blogger") await blogger.publish(w, id, authService);
      else if (channel === "instagram")
        await publishers.instagram(w, id, urls, authService);
      else await publishers[channel](w, id, urls);
    }
    return w.snapshot();
  },
  reconcile: (payload) =>
    require("../core/reconcile.cjs").reconcile(w, payload, authService),
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
    title: "Social Media Agent · Beta",
    backgroundColor: "#f7f8f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const link = new URL(url);
      if (
        ["https:", "http:"].includes(link.protocol) &&
        !link.username &&
        !link.password
      )
        void shell.openExternal(link.href);
    } catch {}
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.on("will-prevent-unload", (event) => {
    const response = dialog.showMessageBoxSync(win, {
      type: "question",
      buttons: ["Continuar editando", "Descartar alterações"],
      defaultId: 0,
      cancelId: 0,
      message: "Há alterações ainda não salvas.",
      detail: "Ao sair desta tela, essas alterações serão descartadas.",
    });
    if (response === 1) event.preventDefault();
  });
  for (const [name, action] of Object.entries(actions))
    ipcMain.handle("studio:" + name, async (event, payload) => {
      if (
        event.sender !== win.webContents ||
        event.senderFrame !== win.webContents.mainFrame
      )
        throw Error("Origem inválida.");
      if (
        !["open", "state", "cancel", "models", "finishClose"].includes(name) &&
        !w
      )
        throw Error("Abra um workspace.");
      const mutation = ![
        "state",
        "cancel",
        "models",
        "render",
        "previewCards",
        "draft",
        "finishClose",
      ].includes(name);
      const operationId = mutation
        ? operations.begin(name, payload?.id, cancellable.has(name))
        : null;
      try {
        return await action(payload);
      } catch (e) {
        throw Error(e.message || "Operação não concluída.");
      } finally {
        if (operationId) operations.finish(operationId);
      }
    });
  win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.on("close", (event) => {
    if (closingApproved && !operations.snapshot()) {
      closingApproved = false;
      return;
    }
    if (!operations.snapshot()) {
      event.preventDefault();
      win.webContents.send("studio:prepare-close");
      return;
    }
    if (operations.snapshot()) {
      event.preventDefault();
      dialog.showMessageBox(win, {
        message: operations.snapshot()?.cancellable
          ? "Há uma operação em andamento. Use Cancelar no aplicativo antes de fechar."
          : "Há uma operação que precisa terminar antes de fechar o aplicativo.",
      });
    }
  });
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  if (!operations.snapshot() && w) {
    w.close();
    w = null;
  }
});
