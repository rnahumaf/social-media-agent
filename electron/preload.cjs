const { contextBridge, ipcRenderer } = require("electron");
const methods = [
  "state",
  "open",
  "create",
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
];
contextBridge.exposeInMainWorld(
  "studio",
  Object.fromEntries(
    methods.map((name) => [
      name,
      (payload) => ipcRenderer.invoke("studio:" + name, payload),
    ]),
  ),
);
