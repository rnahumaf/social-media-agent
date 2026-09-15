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
edit("src/Studio.tsx", 'operation?.cancellable && !(screen === "settings" && operation.name.endsWith("Connect")) && (', 'operation?.cancellable && (');
for (const name of ["connecting", "bloggerConnecting", "wpConnecting"]) {
  const text = fs.readFileSync("src/panels.tsx", "utf8");
  const pattern = new RegExp('\\s*\\{' + name + ' && \\(\\s*<button onClick=\\{\\(\\) => act\\("cancel"\\)\\}>Cancelar conexão<\\/button>\\s*\\)\\}', 'g');
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw Error("Missing duplicate connection cancel: " + name);
  fs.writeFileSync("src/panels.tsx", text.replace(pattern, ""));
}
edit("tests/editorial-desktop.cjs",
  '  const evaluate = (code) => win.webContents.executeJavaScript(code);',
  '  const evaluate = (code) => win.webContents.executeJavaScript(code).catch((error) => {\n    console.error("Failed renderer evaluation:", code);\n    throw error;\n  });');
edit("tests/p0-desktop.cjs", '  const evaluate = code => win.webContents.executeJavaScript(code);',
  '  const evaluate = code => win.webContents.executeJavaScript(code).catch(error => { console.error("Failed P0 renderer evaluation:", code); throw error; });');
console.log("P0 final transformations applied.");
