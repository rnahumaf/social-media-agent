// Branch-only final transformations; removed after tested source is committed.
const fs = require("node:fs");
function edit(file, old, next) {
  const text = fs.readFileSync(file, "utf8");
  if (text.split(old).length !== 2) throw Error("Missing unique final anchor in " + file + ": " + old.slice(0, 100));
  fs.writeFileSync(file, text.replace(old, next));
}
edit("src/Studio.tsx",
  '    const refresh = () => api.state().then((value: State | null) => { if (active) setState(value); }).catch(() => {});',
  '    const refresh = () => {\n      const owner = activeAction.current;\n      return api.state().then((value: State | null) => {\n        if (active && activeAction.current === owner) setState(value);\n      }).catch(() => {});\n    };');
edit("src/Studio.tsx",
  '        await api.cancel({ operationId: operation.id });\n        setState(await api.state());',
  '        const owner = activeAction.current;\n        await api.cancel({ operationId: operation.id });\n        const refreshed = await api.state();\n        if (activeAction.current === owner || !activeAction.current) setState(refreshed);');
edit("src/Studio.tsx",
  '      } else if (result === true) setNotice("Operação concluída.");',
  '      } else {\n        // Proposals and boolean results do not carry a final workspace snapshot.\n        // Refresh before resolving so the editor never retains a completed operation.\n        setState(await api.state());\n        if (result === true) setNotice("Operação concluída.");\n      }');
edit("src/Studio.tsx", 'operation?.cancellable && !(screen === "settings" && operation.name.endsWith("Connect")) && (', 'operation?.cancellable && (');
for (const name of ["connecting", "bloggerConnecting", "wpConnecting"]) {
  const text = fs.readFileSync("src/panels.tsx", "utf8");
  const pattern = new RegExp('\\s*\\{' + name + ' && \\(\\s*<button onClick=\\{\\(\\) => act\\("cancel"\\)\\}>Cancelar conexão<\\/button>\\s*\\)\\}', 'g');
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw Error("Missing duplicate connection cancel: " + name);
  fs.writeFileSync("src/panels.tsx", text.replace(pattern, ""));
}
edit("core/workspace.cjs", '      unlocked: !!this.secrets,',
  '      unlocked: !!this.secrets,\n      wordpressConfigured: !!(this.state.settings.wordpressProvider === "wordpress.com" ? this.secrets?.wordpressCom : this.secrets?.wordpress),\n      bloggerConfigured: !!this.secrets?.blogger,\n      instagramConfigured: !!this.secrets?.instagram,');
edit("src/types.ts", '  unlocked?: boolean;', '  unlocked?: boolean;\n  wordpressConfigured?: boolean;\n  bloggerConfigured?: boolean;\n  instagramConfigured?: boolean;');
edit("core/publication-view.mjs", '  const configured = channel === "export"',
  '  const accessReady = !options.desktop || channel === "export" || !!state[channel + "Configured"];\n  const configured = channel === "export"');
edit("core/publication-view.mjs", '  if (channel !== "export" && ["sending", "uncertain"].includes(publication?.status)) {',
  '  if (options.desktop && state.unlocked && !accessReady)\n    return { ...result, mode: "connect", status: "Autorização ausente", reason: "Conecte este destino antes de publicar ou verificar uma tentativa." };\n  if (channel !== "export" && ["sending", "uncertain"].includes(publication?.status)) {');
edit("tests/p0-state.test.cjs", 'const state = { unlocked: true, instagramMediaConfigured: true, settings:',
  'const state = { unlocked: true, wordpressConfigured: true, bloggerConfigured: true, instagramConfigured: true, instagramMediaConfigured: true, settings:');
fs.appendFileSync("tests/p0-state.test.cjs", '\ntest("P0 missing publication authorization exposes configuration instead of a rejected action", async () => {\n  const { publicationView } = await import("../core/publication-view.mjs");\n  for (const channel of ["wordpress", "blogger", "instagram"]) {\n    const { project, state } = fixture();\n    state[channel + "Configured"] = false;\n    assert.equal(publicationView(project, state, channel, { desktop: true }).mode, "connect");\n    project.publications[channel] = { status: "uncertain", revision: "r1" };\n    const view = publicationView(project, state, channel, { desktop: true });\n    assert.equal(view.mode, "connect");\n    assert.equal(view.canCheck, false);\n    assert.equal(view.canPublish, false);\n  }\n});\n');
edit("tests/editorial-desktop.cjs",
  '  const evaluate = (code) => win.webContents.executeJavaScript(code);',
  '  const evaluate = (code) => win.webContents.executeJavaScript(code).catch((error) => {\n    console.error("Failed renderer evaluation:", code);\n    throw error;\n  });');
edit("tests/p0-desktop.cjs", '  const evaluate = code => win.webContents.executeJavaScript(code);',
  '  const evaluate = code => win.webContents.executeJavaScript(code).catch(error => { console.error("Failed P0 renderer evaluation:", code); throw error; });');
console.log("P0 final transformations applied.");
