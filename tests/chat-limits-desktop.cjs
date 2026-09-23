const { app, BrowserWindow, dialog } = require("electron");
app.disableHardwareAcceleration();
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "chat-limits-desktop-"));
app.setPath("userData", path.join(root, "user-data"));
app.once("quit", () => {
  const resolved = fs.realpathSync(root);
  if (
    path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) ||
    !path.basename(resolved).startsWith("chat-limits-desktop-")
  )
    throw Error("Unexpected desktop fixture path.");
  fs.rmSync(resolved, { recursive: true, force: true });
});
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [path.join(root, "workspace")],
});
let calls = [];
let alwaysLength = false;
global.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, "openrouter.ai");
  const body = JSON.parse(options.body);
  calls.push(body.max_tokens);
  const limited = alwaysLength || calls.length === 1;
  return Response.json({
    model: body.model,
    choices: [
      {
        message: {
          content: limited ? "Resposta parcial" : "Resposta completa",
        },
        finish_reason: limited ? "length" : "stop",
      },
    ],
    usage: { total_tokens: 25 },
  });
};
require("../electron/main.cjs");

app.whenReady().then(async () => {
  try {
    const win = BrowserWindow.getAllWindows()[0];
    await new Promise((resolve) =>
      win.webContents.isLoading()
        ? win.webContents.once("did-finish-load", resolve)
        : resolve(),
    );
    const call = (name, payload) =>
      win.webContents.executeJavaScript(
        `window.studio[${JSON.stringify(name)}](${JSON.stringify(payload)})`,
      );
    await call("open");
    await call("vault", {
      password: "fixture-password-123",
      values: { openrouter: "fixture-key" },
      remember: false,
    });
    const state = await call("state");
    await call("settings", {
      settings: {
        ...state.settings,
        models: {
          researcher: "fixture-model",
          writer: "fixture-model",
          social: "fixture-model",
          reviewer: "fixture-model",
        },
      },
    });
    const created = await call("create", {
      title: "Pauta fictícia",
      brief: "Conversa de teste",
      channels: ["blog"],
      manual: true,
    });
    const id = created.projects[0].id;
    const completed = await call("chat", {
      id,
      message: "Responda ao teste",
      requestId: "chat-1",
    });
    assert.deepEqual(calls, [2000, 4000]);
    assert.equal(
      completed.projects[0].messages.find((item) => item.role === "assistant")
        .content,
      "Resposta completa",
    );
    assert.equal(
      completed.projects[0].messages.find((item) => item.role === "assistant")
        .usage.total_tokens,
      50,
    );

    calls = [];
    alwaysLength = true;
    const payload = {
      id,
      message: "Outra resposta de teste",
      requestId: "chat-2",
    };
    await assert.rejects(call("chat", payload), /limite máximo/);
    assert.deepEqual(calls, [2000, 4000]);
    const paused = (await call("state")).projects[0];
    assert.equal(
      paused.messages.find((item) => item.requestId === "chat-2").usage
        .total_tokens,
      50,
    );
    calls = [];
    await assert.rejects(call("chat", payload), /limite máximo/);
    assert.deepEqual(calls, [4000]);
    assert.equal(
      (await call("state")).projects[0].messages.filter(
        (item) => item.role === "user" && item.requestId === "chat-2",
      ).length,
      1,
    );

    const loaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.reload();
    await loaded;
    const until = Date.now() + 5000;
    while (
      !(await win.webContents.executeJavaScript(
        "!!document.querySelector('.context-tools')",
      ))
    ) {
      if (Date.now() > until) throw Error("Chat UI did not load.");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    await win.webContents.executeJavaScript(
      "document.querySelector('.context-tools').open = true; [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Conversa').click()",
    );
    const view = await win.webContents.executeJavaScript(`({
      retryButtons: [...document.querySelectorAll('.messages button')].filter(b => b.textContent.includes('Tentar responder novamente')).length,
      failedMessages: [...document.querySelectorAll('.messages small')].filter(s => s.textContent.includes('Resposta não concluída')).length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    })`);
    assert.equal(view.retryButtons, 1);
    assert.equal(view.failedMessages, 1);
    assert.equal(view.horizontalOverflow, false);
    win.setSize(780, 640);
    const narrow = await win.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.messages button')].find(b => b.textContent.includes('Tentar responder novamente'));
      const bounds = button.getBoundingClientRect();
      const modal = document.querySelector('.modal').getBoundingClientRect();
      button.focus();
      return {
        visible: bounds.width > 0 && bounds.height > 0,
        insideModal: bounds.left >= modal.left && bounds.right <= modal.right,
        focused: document.activeElement === button,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    })()`);
    assert.deepEqual(narrow, {
      visible: true,
      insideModal: true,
      focused: true,
      horizontalOverflow: false,
    });

    alwaysLength = false;
    await win.webContents.executeJavaScript(
      "[...document.querySelectorAll('.messages button')].find(b => b.textContent.includes('Tentar responder novamente')).click()",
    );
    const retryUntil = Date.now() + 5000;
    while (
      (await call("state")).projects[0].messages.find(
        (item) => item.requestId === "chat-2" && item.role === "user",
      ).status !== "completed"
    ) {
      if (Date.now() > retryUntil) throw Error("Chat retry did not finish.");
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.equal(
      (await call("state")).projects[0].messages.filter(
        (item) => item.role === "user" && item.requestId === "chat-2",
      ).length,
      1,
    );

    console.log("Chat limit recovery desktop passed.");
    win.destroy();
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
