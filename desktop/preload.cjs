// Ponte entre o site e o app: só o que o site precisa, nada do Node.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clyroDesktop", {
  platform: process.platform,
  version: (process.argv.find((a) => a.startsWith("--clyro-version=")) || "").slice(16),
  onPickSource(handler) {
    const listener = (_event, request) => handler(request);
    ipcRenderer.on("clyro:pick-source", listener);
    return () => ipcRenderer.removeListener("clyro:pick-source", listener);
  },
  answerPick(requestId, sourceId) {
    ipcRenderer.send("clyro:source-picked", requestId, sourceId);
  },
});
