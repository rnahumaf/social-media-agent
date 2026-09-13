const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const initSql = require("sql.js");
const { z } = require("zod");
const roles = ["researcher", "writer", "social", "reviewer"];
const text = z.string().max(200000);
const revisionSchema = z.object({
  id: z.string(),
  article: text,
  caption: text,
  cards: z
    .array(z.object({ title: z.string().max(90), body: z.string().max(420) }))
    .max(10),
  createdAt: z.string(),
  sourceRevision: z.string().optional(),
  sources: z.array(z.any()).optional(),
  demo: z.boolean().optional(),
});
const stateSchema = z.object({
  format: z.literal(1),
  name: z.string(),
  memory: text,
  settings: z.object({
    demo: z.boolean(),
    models: z.record(z.string()),
    wordpressUrl: z.string(),
    wordpressUser: z.string(),
    wordpressProvider: z.enum(["selfhosted", "wordpress.com"]).optional(),
    wordpressSiteId: z.string().optional(),
    wordpressSiteName: z.string().optional(),
    bloggerId: z.string().optional(),
    bloggerUrl: z.string().optional(),
    bloggerName: z.string().optional(),
    bloggerBlogs: z
      .array(z.object({ id: z.string(), name: z.string(), url: z.string() }))
      .optional(),
    instagramAccount: z.string(),
    graphVersion: z.string(),
    instagramUsername: z.string().optional(),
    instagramExpiresAt: z.number().optional(),
  }),
  projects: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(180),
      brief: text,
      query: text,
      status: z.string(),
      sources: z.array(z.any()),
      messages: z.array(z.any()),
      runs: z.array(z.any()),
      sessions: z.array(z.any()).default([]),
      revisions: z.array(revisionSchema),
      approval: z.any().nullable(),
      approvalHistory: z.array(z.any()).optional(),
      publications: z.record(z.any()),
    }),
  ),
});
const roleNames = {
  researcher: "Pesquisador",
  writer: "Redator",
  social: "Social media",
  reviewer: "Revisor",
};
function legacyArtifact(p, role) {
  return p.messages
    .filter((message) => message.role === "assistant" && message.agent === role)
    .at(-1)?.content;
}
function migrateSessions(state) {
  for (const p of state.projects) {
    if (
      p.sessions.length ||
      !["running", "failed", "interrupted", "cancelled"].includes(p.status) ||
      !p.runs.length
    )
      continue;
    let start = -1;
    if (p.sources.length)
      for (let index = p.runs.length - 1; index >= 0; index--)
        if (
          p.runs[index].phase === "search" &&
          p.runs[index].status === "completed" &&
          p.runs[index].resultCount
        ) {
          start = index;
          break;
        }
    if (start < 0)
      for (let index = p.runs.length - 1; index >= 0; index--)
        if (p.runs[index].phase === "search") {
          start = index;
          break;
        }
    if (start < 0) start = Math.max(0, p.runs.length - roles.length);
    const group = p.runs.slice(start);
    const stopped = [...group]
      .reverse()
      .find((item) => item.status !== "completed");
    const lastCompleted = [...group]
      .reverse()
      .find((item) => item.status === "completed");
    const cursor = stopped
      ? stopped.phase === "search"
        ? "search"
        : stopped.role
      : lastCompleted?.phase === "search"
        ? "researcher"
        : roles[roles.indexOf(lastCompleted?.role) + 1] || "reviewer";
    const dossier = legacyArtifact(p, "researcher");
    const article = legacyArtifact(p, "writer");
    const socialText = legacyArtifact(p, "social");
    let social;
    try {
      social = socialText
        ? JSON.parse(
            socialText.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
          )
        : undefined;
    } catch {}
    const session = {
      id: crypto.randomUUID(),
      status: p.status === "cancelled" ? "cancelled" : "paused",
      cursor,
      startedAt: group[0]?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      error:
        "A execução anterior não foi concluída. O material recuperado está pronto para uma nova tentativa.",
      events: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          kind: "status",
          title: "Execução anterior recuperada",
          detail:
            "O aplicativo preservou as etapas concluídas e retomará do último ponto disponível.",
        },
      ],
      artifacts: {
        query: p.query,
        sources: structuredClone(p.sources),
        ...(dossier ? { dossier } : {}),
        ...(article ? { article } : {}),
        ...(social ? { social } : {}),
      },
    };
    for (const item of group) {
      const sourceCount = item.resultCount || p.sources.length;
      item.sessionId = session.id;
      session.events.push({
        id: crypto.randomUUID(),
        at: item.finishedAt || item.startedAt || session.updatedAt,
        kind: item.status === "completed" ? "output" : "error",
        role: item.role,
        title:
          item.phase === "search"
            ? item.status === "completed"
              ? `${sourceCount} ${sourceCount === 1 ? "fonte preservada" : "fontes preservadas"}`
              : "Busca científica não concluída"
            : `${roleNames[item.role] || item.role} · ${
                item.status === "completed"
                  ? "etapa preservada"
                  : "etapa interrompida"
              }`,
        detail:
          item.error ||
          (item.status === "completed"
            ? "Resultado disponível no workspace."
            : "Aguardando nova tentativa."),
      });
    }
    if (
      social &&
      group.some(
        (item) => item.role === "social" && item.status === "completed",
      ) &&
      current(p)
    )
      session.revisionId = current(p).id;
    p.sessions.push(session);
    p.status = session.status;
  }
  return state;
}
function initial() {
  return {
    format: 1,
    name: "Meu workspace",
    memory:
      "Escreva em português brasileiro para o público definido na pauta. Sustente uma tese clara, preserve incertezas específicas e cite as fontes consultadas perto das afirmações correspondentes.",
    settings: {
      demo: true,
      models: Object.fromEntries(roles.map((r) => [r, ""])),
      wordpressUrl: "",
      wordpressUser: "",
      instagramAccount: "",
      graphVersion: "v23.0",
    },
    projects: [],
  };
}
function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
function current(p) {
  return p.revisions.at(-1);
}
function approvalHash(p, settings, channel) {
  return digest({
    revision: current(p),
    renderer: "editorial-portrait-v1",
    channel,
    destination:
      channel === "wordpress"
        ? [
            settings.wordpressUrl,
            settings.wordpressUser,
            settings.wordpressProvider || "selfhosted",
            settings.wordpressSiteId || "",
          ]
        : channel === "blogger"
          ? [settings.bloggerId || "", settings.bloggerUrl || ""]
          : channel === "instagram"
            ? [settings.instagramAccount, settings.graphVersion]
            : "export",
  });
}
function assertApproved(p, settings, channel) {
  if (
    !current(p) ||
    p.approval?.[channel] !== approvalHash(p, settings, channel)
  )
    throw Error("Aprove a revisão atual para este destino antes de publicar.");
}
function atomic(file, data) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, file);
}
class Workspace {
  static async open(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const lock = path.join(dir, ".workspace.lock");
    let handle;
    try {
      handle = fs.openSync(lock, "wx");
    } catch {
      throw Error(
        "Workspace em uso ou encerrado sem liberar o bloqueio. Feche a outra instância; se houve falha, remova .workspace.lock somente depois de confirmar que ela encerrou.",
      );
    }
    try {
      const SQL = await initSql();
      const file = path.join(dir, "workspace.sqlite");
      const db = new SQL.Database(
        fs.existsSync(file) ? fs.readFileSync(file) : undefined,
      );
      db.run(
        "CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY, data TEXT NOT NULL)",
      );
      const result = db.exec("SELECT data FROM workspace WHERE id=1");
      const state = result.length
        ? migrateSessions(stateSchema.parse(JSON.parse(result[0].values[0][0])))
        : initial();
      const w = new Workspace();
      Object.assign(w, { dir, lock, handle, db, state, secrets: null });
      w.save();
      return w;
    } catch (e) {
      fs.closeSync(handle);
      fs.unlinkSync(lock);
      throw e;
    }
  }
  save() {
    stateSchema.parse(this.state);
    this.db.run("INSERT OR REPLACE INTO workspace VALUES(1,?)", [
      JSON.stringify(this.state),
    ]);
    atomic(path.join(this.dir, "workspace.sqlite"), this.db.export());
    atomic(
      path.join(this.dir, "workspace.json"),
      JSON.stringify({ format: 1, name: this.state.name }, null, 2),
    );
  }
  lockVault() {
    this.secrets = null;
    this.vaultKey?.fill(0);
    this.vaultKey = null;
  }
  close() {
    this.lockVault();
    this.db.close();
    fs.closeSync(this.handle);
    fs.unlinkSync(this.lock);
  }
  snapshot() {
    return structuredClone({
      ...this.state,
      unlocked: !!this.secrets,
      vaultRemembered: !!this.vaultRemembered,
      vaultRememberError: this.vaultRememberError,
      openrouterConfigured: this.secrets
        ? typeof this.secrets.openrouter === "string" &&
          !!this.secrets.openrouter.trim()
        : undefined,
      instagramMediaConfigured: this.secrets
        ? typeof this.secrets.instagramMedia === "string" &&
          this.secrets.instagramMedia.length >= 40
        : undefined,
    });
  }
  unlock(password, values) {
    if (typeof password !== "string" || password.length < 10)
      throw Error("Use uma senha-mestra com pelo menos 10 caracteres.");
    const file = path.join(this.dir, "vault.enc");
    if (fs.existsSync(file)) {
      const v = JSON.parse(fs.readFileSync(file, "utf8"));
      const key = crypto.scryptSync(password, Buffer.from(v.salt, "hex"), 32);
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(v.iv, "hex"),
      );
      decipher.setAuthTag(Buffer.from(v.tag, "hex"));
      try {
        this.secrets = JSON.parse(
          Buffer.concat([
            decipher.update(Buffer.from(v.data, "hex")),
            decipher.final(),
          ]).toString(),
        );
      } catch {
        throw Error("Senha-mestra incorreta ou cofre danificado.");
      }
    } else this.secrets = {};
    if (values) {
      for (const [k, v] of Object.entries(values))
        if (
          [
            "openrouter",
            "wordpress",
            "instagram",
            "instagramMedia",
            "wordpressCom",
            "blogger",
          ].includes(k) &&
          typeof v === "string" &&
          v
        )
          this.secrets[k] = v;
    }
    const salt = crypto.randomBytes(16),
      iv = crypto.randomBytes(12),
      key = crypto.scryptSync(password, salt, 32),
      cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    this.vaultKey?.fill(0);
    this.vaultKey = key;
    this.vaultSalt = salt;
    const data = Buffer.concat([
      cipher.update(JSON.stringify(this.secrets)),
      cipher.final(),
    ]);
    atomic(
      file,
      JSON.stringify({
        salt: salt.toString("hex"),
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        data: data.toString("hex"),
      }),
    );
    return this.snapshot();
  }
  storeSecret(name, value) {
    if (!this.secrets || !this.vaultKey)
      throw Error("Desbloqueie o cofre primeiro.");
    const next = { ...this.secrets };
    if (value === null) delete next[name];
    else next[name] = value;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.vaultKey, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(next)),
      cipher.final(),
    ]);
    atomic(
      path.join(this.dir, "vault.enc"),
      JSON.stringify({
        salt: this.vaultSalt.toString("hex"),
        iv: iv.toString("hex"),
        tag: cipher.getAuthTag().toString("hex"),
        data: data.toString("hex"),
      }),
    );
    this.secrets = next;
  }
  project(id) {
    const p = this.state.projects.find((p) => p.id === id);
    if (!p) throw Error("Projeto não encontrado.");
    return p;
  }
  create(title, brief, query = "") {
    const p = {
      id: crypto.randomUUID(),
      title,
      brief,
      query,
      status: "briefing",
      sources: [],
      messages: [],
      runs: [],
      sessions: [],
      revisions: [],
      approval: null,
      publications: {},
    };
    stateSchema.shape.projects.element.parse(p);
    this.state.projects.unshift(p);
    this.save();
    return p;
  }
  revise(id, content) {
    const p = this.project(id);
    const r = revisionSchema.parse({
      ...content,
      sources: content.sources || structuredClone(p.sources),
      demo: content.demo ?? this.state.settings.demo,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
    p.revisions.push(r);
    p.approval = null;
    p.status = "review";
    this.save();
    return r;
  }
  update(id, fields) {
    const p = this.project(id);
    const changes = z
      .object({
        title: z.string().trim().min(1).max(180),
        brief: text,
        query: text.optional(),
      })
      .parse(fields);
    Object.assign(p, changes);
    p.approval = null;
    this.save();
  }
  approve(id, channel) {
    const p = this.project(id);
    if (
      !["export", "wordpress", "instagram", "blogger"].includes(channel) ||
      !current(p)
    )
      throw Error("Revisão ou canal inválido.");
    for (const [i, card] of current(p).cards.entries())
      require("./render.cjs").svgCard(card, i, current(p).cards.length);
    p.approval = {
      ...p.approval,
      [channel]: approvalHash(p, this.state.settings, channel),
    };
    p.approvalHistory ||= [];
    p.approvalHistory.push({
      channel,
      revision: current(p).id,
      hash: p.approval[channel],
      at: new Date().toISOString(),
    });
    this.save();
  }
  backup(destination) {
    if (
      path.resolve(destination) === path.resolve(this.dir) ||
      path.resolve(destination).startsWith(path.resolve(this.dir) + path.sep)
    )
      throw Error("Escolha uma pasta fora do workspace atual.");
    fs.mkdirSync(destination, { recursive: true });
    if (fs.readdirSync(destination).length)
      throw Error("Escolha uma pasta vazia para o backup.");
    this.save();
    for (const file of fs.readdirSync(this.dir))
      if (file !== ".workspace.lock")
        fs.cpSync(path.join(this.dir, file), path.join(destination, file), {
          recursive: true,
        });
  }
}
module.exports = {
  Workspace,
  initial,
  roles,
  current,
  digest,
  assertApproved,
  approvalHash,
  revisionSchema,
};
