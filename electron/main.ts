import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let windowRef: BrowserWindow | null = null;
let videoHost: BrowserWindow | null = null;
let mpv: ChildProcess | null = null;
let socket: net.Socket | null = null;
let buffer = "";
let ipcEndpoint = "";
let relativeBounds = { x: 0, y: 0, width: 640, height: 360 };
const pendingCommands: unknown[][] = [];

function canEmbedNativeWindow() {
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return process.env.XDG_SESSION_TYPE !== "wayland";
  // mpv --wid with a Cocoa NSView is supported by libmpv, not the mpv CLI process.
  return false;
}

function endpoint() {
  if (process.platform === "win32") return `\\\\.\\pipe\\oneplay-mpv-${process.pid}`;
  return path.join(os.tmpdir(), `oneplay-mpv-${process.pid}.sock`);
}

function sendStatus(status: Record<string, unknown>) {
  windowRef?.webContents.send("player:property", status);
}

function sendMpv(command: unknown[]) {
  if (!socket || socket.destroyed) {
    pendingCommands.push(command);
    return;
  }
  socket.write(JSON.stringify({ command }) + "\n");
}

function connectMpv(attempt = 0) {
  if (attempt > 60 || !mpv) return;
  const client = net.createConnection(ipcEndpoint);
  client.on("connect", () => {
    socket = client;
    for (const command of pendingCommands.splice(0)) sendMpv(command);
    sendMpv(["observe_property", 1, "pause"]);
    sendMpv(["observe_property", 2, "time-pos"]);
    sendMpv(["observe_property", 3, "duration"]);
    sendMpv(["observe_property", 4, "volume"]);
    sendMpv(["observe_property", 5, "media-title"]);
    sendMpv(["observe_property", 6, "eof-reached"]);
    sendMpv(["observe_property", 7, "mute"]);
    sendMpv(["observe_property", 8, "speed"]);
  });
  client.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.event === "property-change") sendStatus(message);
      } catch { /* Ignore non-JSON mpv output. */ }
    }
  });
  client.on("error", () => setTimeout(() => connectMpv(attempt + 1), 150));
  client.on("close", () => { if (socket === client) socket = null; });
}

function getScreenBounds() {
  if (!windowRef) return relativeBounds;
  const content = windowRef.getContentBounds();
  return {
    x: Math.round(content.x + relativeBounds.x),
    y: Math.round(content.y + relativeBounds.y),
    width: Math.max(160, Math.round(relativeBounds.width)),
    height: Math.max(90, Math.round(relativeBounds.height))
  };
}

function updateVideoHostBounds() {
  if (videoHost && !videoHost.isDestroyed()) {
    videoHost.setBounds(getScreenBounds());
  }
}

function createVideoHost() {
  if (!windowRef || !canEmbedNativeWindow()) return null;
  if (videoHost && !videoHost.isDestroyed()) return videoHost;
  const bounds = getScreenBounds();
  videoHost = new BrowserWindow({
    parent: windowRef,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    show: false,
    focusable: false,
    skipTaskbar: true,
    backgroundColor: "#000000",
    transparent: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  videoHost.loadURL("data:text/html,<html><body style='margin:0;background:#000'></body></html>");
  videoHost.once("ready-to-show", () => {
    videoHost?.showInactive();
    updateVideoHostBounds();
  });
  videoHost.on("closed", () => { videoHost = null; });
  return videoHost;
}

function nativeWindowId(host: BrowserWindow) {
  const handle = host.getNativeWindowHandle();
  if (process.platform === "win32") {
    // mpv's Win32 wid parser expects the HWND cast to a 32-bit unsigned integer.
    return (handle.readBigUInt64LE(0) & 0xffffffffn).toString();
  }
  // X11 Window is an unsigned long; mpv accepts its decimal representation.
  return handle.readBigUInt64LE(0).toString();
}

function startMpv() {
  if (mpv) return;
  ipcEndpoint = endpoint();
  const args = [
    "--idle=yes", "--force-window=yes", "--keep-open=yes",
    `--input-ipc-server=${ipcEndpoint}`, "--terminal=no",
    "--msg-level=all=warn", "--keepaspect-window=no",
    "--no-border", "--ontop=no"
  ];
  if (canEmbedNativeWindow()) {
    const host = createVideoHost();
    if (host) args.push(`--wid=${nativeWindowId(host)}`);
  } else {
    sendStatus({
      event: "info",
      message: process.platform === "darwin"
        ? "macOS currently uses a separate mpv video window. In-process libmpv rendering is required for true embedding."
        : "Wayland does not support mpv's native window embedding here. Playback opens in a separate mpv window."
    });
  }
  // Apps launched from Finder/the desktop do not inherit the shell PATH, so add the usual mpv install locations.
  const extra = process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]
    : process.platform === "linux" ? ["/usr/local/bin", "/usr/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"] : [];
  const env = { ...process.env, PATH: [process.env.PATH, ...extra].filter(Boolean).join(path.delimiter) };
  mpv = spawn("mpv", args, { stdio: "ignore", windowsHide: true, env });
  mpv.on("error", () => {
    sendStatus({ event: "error", message: "mpv was not found. Install mpv and make sure it is available on PATH." });
  });
  mpv.on("exit", () => { mpv = null; socket?.destroy(); socket = null; });
  connectMpv();
}

function overlayFor() {
  const dark = nativeTheme.shouldUseDarkColors;
  return { color: dark ? "#1c1c1e" : "#f5f5f7", symbolColor: dark ? "#f5f5f7" : "#1d1d1f", height: 44 };
}

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 620,
    title: "OnePlay",
    backgroundColor: process.platform === "darwin" ? "#00000000" : nativeTheme.shouldUseDarkColors ? "#101114" : "#f5f5f7",
    // macOS: traffic lights inset into a translucent sidebar. Windows: custom title bar with native caption buttons.
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : process.platform === "win32" ? "hidden" : "default",
    ...(process.platform === "darwin" ? { vibrancy: "sidebar" as const, visualEffectState: "active" as const, trafficLightPosition: { x: 20, y: 20 } } : {}),
    ...(process.platform === "win32" ? { titleBarOverlay: overlayFor() } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) windowRef.loadURL(process.env.VITE_DEV_SERVER_URL);
  else windowRef.loadFile(path.join(__dirname, "../dist/index.html"));
  windowRef.on("resize", updateVideoHostBounds);
  windowRef.on("enter-full-screen", () => { windowRef?.webContents.send("player:fullscreen", true); });
  windowRef.on("leave-full-screen", () => { windowRef?.webContents.send("player:fullscreen", false); });
  nativeTheme.on("updated", () => { if (process.platform === "win32") windowRef?.setTitleBarOverlay(overlayFor()); });
  windowRef.on("move", updateVideoHostBounds);
  windowRef.on("closed", () => {
    videoHost?.close();
    videoHost = null;
    windowRef = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle("dialog:open-file", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Media", extensions: ["mp4","mkv","avi","mov","webm","m4v","mp3","flac","wav","aac","ogg"] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("player:set-video-bounds", (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) return false;
    relativeBounds = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    };
    updateVideoHostBounds();
    return true;
  });
  ipcMain.handle("player:play", (_event, filePath: string) => {
    startMpv();
    sendMpv(["loadfile", filePath, "replace"]);
    return true;
  });
  ipcMain.handle("player:toggle-pause", () => { sendMpv(["cycle", "pause"]); return true; });
  ipcMain.handle("player:seek", (_event, seconds: number) => { sendMpv(["seek", seconds, "absolute"]); return true; });
  ipcMain.handle("player:set-volume", (_event, volume: number) => { sendMpv(["set_property", "volume", Math.max(0, Math.min(100, volume))]); return true; });
  ipcMain.handle("player:set-mute", (_e, muted: boolean) => { sendMpv(["set_property", "mute", Boolean(muted)]); return true; });
  ipcMain.handle("player:set-speed", (_e, speed: number) => { sendMpv(["set_property", "speed", Math.max(0.25, Math.min(4, Number(speed) || 1))]); return true; });
  ipcMain.handle("player:set-loop", (_e, loop: boolean) => { sendMpv(["set_property", "loop-file", loop ? "inf" : "no"]); return true; });
  ipcMain.handle("window:toggle-fullscreen", () => { windowRef?.setFullScreen(!windowRef.isFullScreen()); return true; });
  ipcMain.handle("player:stop", () => { sendMpv(["stop"]); return true; });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("before-quit", () => {
  socket?.destroy();
  mpv?.kill();
  videoHost?.destroy();
  if (process.platform !== "win32" && ipcEndpoint) {
    try { if (fs.existsSync(ipcEndpoint)) fs.unlinkSync(ipcEndpoint); } catch { /* best effort */ }
  }
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
