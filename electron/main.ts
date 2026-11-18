import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let windowRef: BrowserWindow | null = null;
let mpv: ChildProcess | null = null;
let socket: net.Socket | null = null;
let buffer = "";
let ipcEndpoint = "";

function endpoint() {
  if (process.platform === "win32") return `\\\\.\\pipe\\oneplay-mpv-${process.pid}`;
  return path.join(os.tmpdir(), `oneplay-mpv-${process.pid}.sock`);
}

function sendMpv(command: unknown[]) {
  if (!socket || socket.destroyed) return;
  socket.write(JSON.stringify({ command }) + "\\n");
}

function connectMpv(attempt = 0) {
  if (attempt > 40) return;
  const client = net.createConnection(ipcEndpoint);
  client.on("connect", () => {
    socket = client;
    sendMpv(["observe_property", 1, "pause"]);
    sendMpv(["observe_property", 2, "time-pos"]);
    sendMpv(["observe_property", 3, "duration"]);
    sendMpv(["observe_property", 4, "volume"]);
    sendMpv(["observe_property", 5, "media-title"]);
  });
  client.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split("\\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.event === "property-change" && windowRef) {
          windowRef.webContents.send("player:property", message);
        }
      } catch { /* Ignore non-JSON mpv output. */ }
    }
  });
  client.on("error", () => setTimeout(() => connectMpv(attempt + 1), 150));
}

function startMpv() {
  if (mpv) return;
  ipcEndpoint = endpoint();
  const args = [
    "--idle=yes", "--force-window=yes", "--keep-open=yes",
    `--input-ipc-server=${ipcEndpoint}`, "--terminal=no",
    "--msg-level=all=warn"
  ];
  mpv = spawn("mpv", args, { stdio: "ignore", windowsHide: true });
  mpv.on("error", () => {
    windowRef?.webContents.send("player:property", {
      event: "error", message: "mpv was not found. Install mpv and make sure it is available on PATH."
    });
  });
  mpv.on("exit", () => { mpv = null; socket?.destroy(); socket = null; });
  connectMpv();
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 620,
    title: "OnePlay",
    backgroundColor: "#101114",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    windowRef.loadURL(process.env.VITE_DEV_SERVER_URL);
    windowRef.webContents.openDevTools({ mode: "detach" });
  } else {
    windowRef.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
  windowRef.on("closed", () => { windowRef = null; });
}

app.whenReady().then(() => {
  ipcMain.handle("dialog:open-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Media", extensions: ["mp4","mkv","avi","mov","webm","m4v","mp3","flac","wav","aac","ogg"] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("player:play", (_event, filePath: string) => {
    startMpv();
    sendMpv(["loadfile", filePath, "replace"]);
    return true;
  });
  ipcMain.handle("player:toggle-pause", () => { sendMpv(["cycle", "pause"]); return true; });
  ipcMain.handle("player:seek", (_event, seconds: number) => { sendMpv(["seek", seconds, "absolute"]); return true; });
  ipcMain.handle("player:set-volume", (_event, volume: number) => { sendMpv(["set_property", "volume", Math.max(0, Math.min(100, volume))]); return true; });
  ipcMain.handle("player:stop", () => { sendMpv(["stop"]); return true; });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => {
  socket?.destroy();
  mpv?.kill();
  if (process.platform !== "win32" && ipcEndpoint) {
    try { if (fs.existsSync(ipcEndpoint)) fs.unlinkSync(ipcEndpoint); } catch { /* best effort */ }
  }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
