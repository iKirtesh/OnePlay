import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import * as share from "./share";
import * as extras from "./extras";
import { mpvCommand, mpvEnv } from "./mpvpath";

let windowRef: BrowserWindow | null = null;
let videoHost: BrowserWindow | null = null;
let mpv: ChildProcess | null = null;
let socket: net.Socket | null = null;
let buffer = "";
let ipcEndpoint = "";
let relativeBounds = { x: 0, y: 0, width: 640, height: 360 };
const pendingCommands: unknown[][] = [];

const prefsFile = () => path.join(app.getPath("userData"), "prefs.json");
function readPrefs(): { embedVideo?: boolean; swdec?: boolean } { try { return JSON.parse(fs.readFileSync(prefsFile(), "utf8")); } catch { return {}; } }
/** Whether this system can draw video inside the app window at all. */
function embedSupported() {
  if (process.platform === "linux") return process.env.XDG_SESSION_TYPE !== "wayland";
  // macOS: mpv --wid with a Cocoa NSView is supported by libmpv, not the mpv CLI process.
  return process.platform === "win32";
}
// Embedding draws video into a child window that the app's own surface can cover on some Windows setups,
// so video opens in its own mpv window unless embedding is switched on.
function canEmbedNativeWindow() {
  return embedSupported() && (readPrefs().embedVideo ?? process.platform === "linux");
}

function endpoint() {
  if (process.platform === "win32") return `\\\\.\\pipe\\oneplay-mpv-${process.pid}`;
  return path.join(os.tmpdir(), `oneplay-mpv-${process.pid}.sock`);
}

const writePrefs = (patch: Record<string, unknown>) => { try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), ...patch })); return true; } catch { return false; } };
// Black-picture watchdog: if the video is playing but nothing is on screen, switch to software decoding.
let lastPos = 0, voConfigured: boolean | null = null, hasVideo = false, watchdog: NodeJS.Timeout | null = null;
function armWatchdog() {
  if (watchdog) clearTimeout(watchdog);
  lastPos = 0; voConfigured = null; hasVideo = false;
  watchdog = setTimeout(() => {
    if (readPrefs().swdec || !mpv || !hasVideo || lastPos < 0.5 || voConfigured !== false) return;
    writePrefs({ swdec: true });
    sendMpv(["set_property", "hwdec", "no"]);
    sendMpv(["seek", lastPos, "absolute"]);
    sendStatus({ event: "info", message: "The picture was blank, so OnePlay switched to software decoding for this and later videos." });
    sendStatus({ event: "swdec", value: true });
  }, 4500);
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
    sendMpv(["observe_property", 9, "chapter-list"]);
    sendMpv(["observe_property", 10, "track-list"]);
    sendMpv(["observe_property", 11, "chapter"]);
    sendMpv(["observe_property", 12, "metadata"]);
    sendMpv(["observe_property", 13, "vo-configured"]);
  });
  client.on("data", chunk => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        if (message.event === "property-change") {
          if (message.name === "time-pos" && typeof message.data === "number") lastPos = message.data;
          else if (message.name === "vo-configured") voConfigured = !!message.data;
          else if (message.name === "track-list" && Array.isArray(message.data)) hasVideo = message.data.some((t: any) => t.type === "video" && !t.albumart);
          sendStatus(message);
        }
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
    "--msg-level=all=warn", "--ontop=no", "--volume-max=150", `--hwdec=${readPrefs().swdec ? "no" : "auto-safe"}`
  ];
  if (canEmbedNativeWindow()) args.push("--keepaspect-window=no", "--no-border");
  else args.push("--autofit=60%", "--autofit-larger=92%x92%", "--title=OnePlay - ${media-title}");
  if (canEmbedNativeWindow()) {
    const host = createVideoHost();
    if (host) args.push(`--wid=${nativeWindowId(host)}`);
  } else {
    sendStatus({
      event: "info",
      message: "Video plays in its own window."
    });
  }
  // Apps launched from Finder/the desktop do not inherit the shell PATH, so add the usual mpv install locations.
  mpv = spawn(mpvCommand(), args, { stdio: "ignore", windowsHide: true, env: mpvEnv() });
  mpv.on("error", () => {
    sendStatus({ event: "error", message: process.platform === "win32" ? "mpv was not found. Run \"winget install mpv\" in a terminal, then restart OnePlay." : process.platform === "darwin" ? "mpv was not found. Run \"brew install mpv\", then restart OnePlay." : "mpv was not found. Run \"sudo apt install mpv\", then restart OnePlay." });
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
    // Music shows its album art in the app window, so the native video surface is hidden for audio files.
    if (videoHost && !videoHost.isDestroyed()) {
      if (/\.(mp3|flac|wav|aac|ogg|opus|m4a)$/i.test(filePath)) videoHost.hide();
      else { videoHost.showInactive(); updateVideoHostBounds(); }
    }
    armWatchdog();
    sendMpv(["loadfile", filePath, "replace"]);
    return true;
  });
  ipcMain.handle("player:toggle-pause", () => { sendMpv(["cycle", "pause"]); return true; });
  ipcMain.handle("player:seek", (_event, seconds: number) => { sendMpv(["seek", seconds, "absolute"]); return true; });
  ipcMain.handle("player:set-volume", (_event, volume: number) => { sendMpv(["set_property", "volume", Math.max(0, Math.min(150, volume))]); return true; });
  ipcMain.handle("player:set-eq", (_e, bass: number, treble: number) => {
    const g = (n: number) => Math.max(-12, Math.min(12, Math.round(Number(n) || 0)));
    const b = g(bass), t = g(treble);
    sendMpv(["set_property", "af", b === 0 && t === 0 ? "" : `lavfi=[bass=g=${b},treble=g=${t}]`]);
    return true;
  });
  ipcMain.handle("player:set-mute", (_e, muted: boolean) => { sendMpv(["set_property", "mute", Boolean(muted)]); return true; });
  ipcMain.handle("player:set-speed", (_e, speed: number) => { sendMpv(["set_property", "speed", Math.max(0.25, Math.min(4, Number(speed) || 1))]); return true; });
  ipcMain.handle("player:set-loop", (_e, loop: boolean) => { sendMpv(["set_property", "loop-file", loop ? "inf" : "no"]); return true; });
  ipcMain.handle("window:toggle-fullscreen", () => { windowRef?.setFullScreen(!windowRef.isFullScreen()); return true; });
  ipcMain.handle("player:add-subtitle", async () => {
    if (!windowRef) return false;
    const r = await dialog.showOpenDialog(windowRef, { properties: ["openFile"], filters: [{ name: "Subtitles", extensions: ["srt", "ass", "ssa", "vtt", "sub"] }] });
    if (r.canceled || !r.filePaths[0]) return false;
    sendMpv(["sub-add", r.filePaths[0], "select"]);
    return true;
  });
  ipcMain.handle("player:cycle-sub", () => { sendMpv(["cycle", "sub"]); return true; });
  ipcMain.handle("player:cycle-audio", () => { sendMpv(["cycle", "audio"]); return true; });
  ipcMain.handle("player:frame-step", (_e, back: boolean) => { sendMpv([back ? "frame-back-step" : "frame-step"]); return true; });
  ipcMain.handle("player:ab-loop", () => { sendMpv(["ab-loop"]); return true; });
  ipcMain.handle("player:set-chapter", (_e, n: number) => { sendMpv(["set_property", "chapter", Math.max(0, Math.floor(Number(n) || 0))]); return true; });
  ipcMain.handle("player:screenshot", () => {
    const file = path.join(app.getPath("pictures"), `OnePlay-${new Date().toISOString().replace(/[:.]/g, "-")}.png`);
    sendMpv(["screenshot-to-file", file, "video"]);
    sendStatus({ event: "info", message: `Screenshot saved to Pictures` });
    return file;
  });
  ipcMain.handle("window:toggle-on-top", () => {
    if (!windowRef) return false;
    const on = !windowRef.isAlwaysOnTop();
    windowRef.setAlwaysOnTop(on, "floating");
    if (on && !windowRef.isFullScreen()) windowRef.setSize(420, 560);
    return on;
  });
  share.initShare(() => windowRef?.webContents.send("share:state", share.shareState()));
  share.onRemoteCommand((cmd) => windowRef?.webContents.send("remote:cmd", cmd));
  share.onListsChanged(() => windowRef?.webContents.send("share:lists", share.getLists()));
  share.onPhoneChanged(() => windowRef?.webContents.send("phone:state", share.phoneState()));
  ipcMain.handle("phone:state", () => share.phoneState());
  ipcMain.handle("share:status", (_e, st: Record<string, unknown>) => { share.setStatus(st); return true; });
  ipcMain.handle("share:lists-get", () => share.getLists());
  ipcMain.handle("share:lists-put", (_e, l) => { share.mergeLists(l); return share.getLists(); });
  ipcMain.handle("share:resolve", (_e, keys: string[]) => share.resolveNames(Array.isArray(keys) ? keys.map(String) : []));
  ipcMain.handle("thumb:frame", (_e, file: string, t: number, w: number) => extras.grabFrame(String(file), Number(t) || 0, Math.max(80, Math.min(640, Number(w) || 320))));
  ipcMain.handle("subs:get", () => { const s = extras.getSubSettings(); return { apiKey: s.apiKey, username: s.username, hasPassword: !!s.password }; });
  ipcMain.handle("subs:save", (_e, s) => { const cur = extras.getSubSettings(); extras.saveSubSettings({ apiKey: s.apiKey, username: s.username, password: s.password ? s.password : cur.password }); return true; });
  ipcMain.handle("subs:search", (_e, q: string, lang: string) => extras.searchSubs(String(q), String(lang)));
  ipcMain.handle("subs:download", async (_e, fileId: number, video: string, lang: string) => {
    const r = await extras.downloadSub(Number(fileId), String(video), String(lang));
    sendMpv(["sub-add", r.path, "select"]);
    return r;
  });
  ipcMain.handle("update:check", () => extras.checkUpdate());
  ipcMain.handle("update:open", (_e, url: string) => { extras.openRelease(String(url)); return true; });
  ipcMain.handle("app:get-swdec", () => !!readPrefs().swdec);
  ipcMain.handle("app:set-swdec", (_e, on: boolean) => { writePrefs({ swdec: !!on }); sendMpv(["set_property", "hwdec", on ? "no" : "auto-safe"]); return !!on; });
  ipcMain.handle("app:get-embed", () => ({ embed: canEmbedNativeWindow(), supported: embedSupported() }));
  ipcMain.handle("app:set-embed", (_e, on: boolean) => {
    if (!embedSupported()) return false;
    try { fs.writeFileSync(prefsFile(), JSON.stringify({ ...readPrefs(), embedVideo: !!on })); } catch { return false; }
    app.relaunch(); app.exit(0);
    return true;
  });
  ipcMain.handle("share:state", () => share.shareState());
  ipcMain.handle("share:toggle", async (_e, on: boolean) => { if (on) await share.startShare(); else share.stopShare(); return share.shareState(); });
  ipcMain.handle("share:add-folder", async () => {
    if (!windowRef) return share.shareState();
    const r = await dialog.showOpenDialog(windowRef, { properties: ["openDirectory", "multiSelections"] });
    if (!r.canceled) r.filePaths.forEach(share.addFolder);
    return share.shareState();
  });
  ipcMain.handle("share:remove-folder", (_e, dir: string) => { share.removeFolder(String(dir)); return share.shareState(); });
  ipcMain.handle("share:new-code", () => { share.regenerateCode(); return share.shareState(); });
  ipcMain.handle("share:forget", () => { share.forgetDevices(); return share.shareState(); });
  ipcMain.handle("share:put-resume", (_e, key: string, pos: number, dur: number) => { share.putResume(String(key).toLowerCase(), Number(pos) || 0, Number(dur) || 0); return true; });
  ipcMain.handle("share:get-resume", (_e, key: string) => share.getResume(String(key).toLowerCase()) ?? null);
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
