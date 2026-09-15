const { contextBridge, ipcRenderer } = require("electron");
const methods = [
  "bloggerConnect",
  "bloggerSelect",
  "bloggerTest",
  "bloggerDisconnect",
  "wordpressConnect",
  "wordpressDisconnect",
  "wordpressTest",
  "instagramConnect",
  "instagramDisconnect",
  "instagramTest",
  "state",
  "open",
  "create",
  "update",
  "settings",
  "vault",
  "lock",
  "models",
  "run",
  "cancel",
  "edit",
  "approve",
  "export",
  "backup",
  "chat",
  "publish",
  "reconcile",
  "render",
  "previewCards",
  "draft",
  "finishClose",
  "importImage",
  "rewrite",
  "knowledge",
];
contextBridge.exposeInMainWorld("studio", {
  onPrepareClose: (handler) => {
    const listener = () => handler();
    ipcRenderer.on("studio:prepare-close", listener);
    return () => ipcRenderer.removeListener("studio:prepare-close", listener);
  },
  ...Object.fromEntries(
    methods.map((name) => [
      name,
      (payload) => ipcRenderer.invoke("studio:" + name, payload),
    ]),
  ),
});
