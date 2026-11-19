import http from "node:http";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

/**
 * Wi-Fi sharing: lets a paired phone on the same network browse the folders you choose, stream files,
 * and sync resume positions. Only private-network clients with a pairing token are served.
 */
const MEDIA = /\.(mp4|mkv|avi|mov|webm|m4v|wmv|ts|mp3|flac|wav|aac|ogg|opus|m4a)$/i;
const MIME: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", wmv: "video/x-ms-wmv", ts: "video/mp2t", mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4" };
const PORT = 8765;

type Resume = { pos: number; dur: number; at: number };
type FavMap = Record<string, { on: boolean; at: number }>;
type Playlist = { id: string; name: string; items: string[]; at: number; deleted?: boolean };
export type Lists = { fav: FavMap; playlists: Record<string, Playlist> };
type Store = { folders: string[]; tokens: string[]; sync: Record<string, Resume>; lists: Lists };
type Entry = { id: string; path: string; name: string; size: number; ext: string };

let server: http.Server | null = null;
let port = PORT;
let code = newCode();
let store: Store = { folders: [], tokens: [], sync: {}, lists: { fav: {}, playlists: {} } };
let files = new Map<string, Entry>();
let idByPath = new Map<string, string>();
let tree: { id: string; name: string; items: Omit<Entry, "path">[] }[] = [];
let treeAt = 0;
const fails = new Map<string, { n: number; until: number }>();

function newCode() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"); }
const storeFile = () => path.join(app.getPath("userData"), "share.json");
function load() { try { const s = JSON.parse(fs.readFileSync(storeFile(), "utf8")); store = { folders: s.folders ?? [], tokens: s.tokens ?? [], sync: s.sync ?? {}, lists: { fav: s.lists?.fav ?? {}, playlists: s.lists?.playlists ?? {} } }; } catch { /* first run */ } }
let saveTimer: NodeJS.Timeout | null = null;
function save() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(storeFile(), JSON.stringify(store)); } catch { /* disk unavailable */ } }, 500); }

const isPrivate = (ip: string) => {
  const a = ip.replace(/^::ffff:/, "");
  return a === "::1" || a.startsWith("127.") || a.startsWith("10.") || a.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || a.startsWith("169.254.") || /^f[cd]/i.test(a) || /^fe80/i.test(a);
};
const lanRank = (a: string) => (a.startsWith("192.168.") ? 0 : a.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(a) ? 2 : 3);
export const addresses = () => Object.values(os.networkInterfaces()).flat().filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal).map((i) => i.address).sort((a, b) => lanRank(a) - lanRank(b));

async function walk(dir: string, depth: number, out: Entry[]) {
  if (depth > 6 || out.length > 20000) return;
  let list: fs.Dirent[];
  try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const d of list) {
    if (d.name.startsWith(".")) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, depth + 1, out);
    else if (MEDIA.test(d.name)) {
      let size = 0; try { size = (await fs.promises.stat(p)).size; } catch { continue; }
      const id = crypto.createHash("sha1").update(p).digest("hex").slice(0, 16);
      out.push({ id, path: p, name: d.name.replace(/\.[^.]+$/, ""), size, ext: path.extname(d.name).slice(1).toLowerCase() });
    }
  }
}
async function rescan(force = false) {
  if (!force && Date.now() - treeAt < 30000) return;
  const byDir = new Map<string, Entry[]>(); const all = new Map<string, Entry>();
  for (const root of store.folders) {
    const list: Entry[] = []; await walk(root, 0, list);
    for (const e of list) { all.set(e.id, e); const dir = path.dirname(e.path); (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(e); }
  }
  files = all; idByPath = new Map([...all.values()].map((e) => [e.path, e.id])); treeAt = Date.now();
  tree = [...byDir.entries()].map(([dir, items]) => ({ id: crypto.createHash("sha1").update(dir).digest("hex").slice(0, 12), name: path.basename(dir) || dir, items: items.map(({ path: _p, ...rest }) => rest).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) })).sort((a, b) => a.name.localeCompare(b.name));
}

const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req: http.IncomingMessage) => new Promise<string>((resolve) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 2_000_000) req.destroy(); }); req.on("end", () => resolve(b)); });
const tokenOf = (req: http.IncomingMessage, url: URL) => url.searchParams.get("t") ?? (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
const authed = (req: http.IncomingMessage, url: URL) => { const t = tokenOf(req, url); return !!t && store.tokens.some((x) => x.length === t.length && crypto.timingSafeEqual(Buffer.from(x), Buffer.from(t))); };

/** Validates a remote command and passes it to the player. Used by both HTTP and the live connection. */
async function runCommand(b: Record<string, unknown>): Promise<{ code: number; body: unknown }> {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const cmd = String(b.cmd);
  if (cmd === "playId") {
    await rescan(false);
    const e = files.get(String(b.id));
    if (!e) return { code: 404, body: { error: "Unknown file; refresh the library" } };
    if (!remoteHandler) return { code: 503, body: { error: "Player not ready" } };
    remoteHandler({ cmd: "playFile", path: e.path }); return { code: 200, body: { ok: true } };
  }
  const out: Record<string, unknown> = { cmd };
  if (["toggle", "play", "pause", "mute", "next", "prev"].includes(cmd)) { /* no argument */ }
  else if (cmd === "seekBy" && num(b.by) !== null) out.by = Math.max(-3600, Math.min(3600, num(b.by)!));
  else if (cmd === "seekTo" && num(b.to) !== null) out.to = Math.max(0, num(b.to)!);
  else if (cmd === "volume" && num(b.value) !== null) out.value = Math.max(0, Math.min(100, num(b.value)!));
  else if (cmd === "speed" && num(b.value) !== null) out.value = Math.max(0.25, Math.min(4, num(b.value)!));
  else return { code: 400, body: { error: "Unknown command" } };
  if (!remoteHandler) return { code: 503, body: { error: "Player not ready" } };
  remoteHandler(out); return { code: 200, body: { ok: true } };
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const ip = req.socket.remoteAddress ?? "";
  if (!isPrivate(ip)) { res.writeHead(403); res.end(); return; }
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/api/info") return json(res, 200, { app: "OnePlay", name: os.hostname() });
  if (url.pathname === "/api/pair" && req.method === "POST") {
    const f = fails.get(ip);
    if (f && f.until > Date.now()) return json(res, 429, { error: "Too many attempts, try again in a minute" });
    let body: { code?: string } = {}; try { body = JSON.parse(await readBody(req)); } catch { /* bad json */ }
    if (body.code !== code) { const n = (f?.n ?? 0) + 1; fails.set(ip, { n, until: n >= 5 ? Date.now() + 60000 : 0 }); return json(res, 401, { error: "Wrong code" }); }
    const token = crypto.randomBytes(24).toString("hex");
    store.tokens.push(token); code = newCode(); save(); notify();
    return json(res, 200, { token, name: os.hostname() });
  }
  if (!authed(req, url)) return json(res, 401, { error: "Not paired" });
  if (url.pathname === "/api/library") { await rescan(url.searchParams.get("refresh") === "1"); return json(res, 200, { folders: tree }); }
  if (url.pathname === "/api/sync") {
    if (req.method === "PUT") {
      try { const inc = JSON.parse(await readBody(req)) as Record<string, Resume>; for (const [k, v] of Object.entries(inc)) if (v && typeof v.pos === "number" && typeof v.at === "number" && (store.sync[k]?.at ?? 0) < v.at) store.sync[k] = { pos: v.pos, dur: Number(v.dur) || 0, at: v.at }; save(); } catch { return json(res, 400, { error: "bad json" }); }
    }
    return json(res, 200, store.sync);
  }
  if (url.pathname === "/api/status") return json(res, 200, { ...(status ?? {}), online: !!status && Date.now() - statusAt < 5000 });
  if (url.pathname === "/api/control" && req.method === "POST") {
    let b: Record<string, unknown> = {}; try { b = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "bad json" }); }
    const r = await runCommand(b); return json(res, r.code, r.body);
  }
  if (url.pathname === "/api/lists") {
    if (req.method === "PUT") { try { mergeLists(JSON.parse(await readBody(req))); } catch { return json(res, 400, { error: "bad json" }); } }
    return json(res, 200, store.lists);
  }
  const m = url.pathname.match(/^\/file\/([0-9a-f]{16})$/);
  if (m) {
    const e = files.get(m[1]!);
    if (!e) return json(res, 404, { error: "Unknown file; refresh the library" });
    let st: fs.Stats; try { st = await fs.promises.stat(e.path); } catch { return json(res, 404, { error: "File missing" }); }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    let start = 0, end = st.size - 1, status = 200;
    if (range) { if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end; } else if (range[2]) { start = Math.max(0, st.size - Number(range[2])); } status = 206; }
    if (start > end || start >= st.size) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); res.end(); return; }
    const headers: Record<string, string | number> = { "Content-Type": MIME[e.ext] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": end - start + 1 };
    if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    res.writeHead(status, headers);
    if (req.method === "HEAD") { res.end(); return; }
    const stream = fs.createReadStream(e.path, { start, end });
    stream.on("error", () => res.destroy()); res.on("close", () => stream.destroy());
    stream.pipe(res); return;
  }
  json(res, 404, { error: "Not found" });
}

let status: Record<string, unknown> | null = null;
let statusAt = 0;
let remoteHandler: ((cmd: Record<string, unknown>) => void) | null = null;
let listsChanged: (() => void) | null = null;
export function setStatus(s: Record<string, unknown>) {
  const { path: p, ...rest } = s as { path?: string } & Record<string, unknown>;
  status = { ...rest, id: typeof p === "string" ? idByPath.get(p) ?? null : null }; statusAt = Date.now();
  broadcast({ type: "status", ...status, online: true });
}
export function onRemoteCommand(fn: (cmd: Record<string, unknown>) => void) { remoteHandler = fn; }
export function onListsChanged(fn: () => void) { listsChanged = fn; }
export const getLists = () => store.lists;
/** Merges favorites and playlists from another device; the newest change to each entry wins. */
export function mergeLists(inc: Partial<Lists>) {
  let changed = false;
  for (const [k, v] of Object.entries(inc.fav ?? {})) if (v && typeof v.at === "number" && (store.lists.fav[k]?.at ?? 0) < v.at) { store.lists.fav[k] = { on: !!v.on, at: v.at }; changed = true; }
  for (const [k, v] of Object.entries(inc.playlists ?? {})) if (v && typeof v.at === "number" && Array.isArray(v.items) && (store.lists.playlists[k]?.at ?? 0) < v.at) { store.lists.playlists[k] = { id: String(v.id ?? k), name: String(v.name ?? "Playlist").slice(0, 80), items: v.items.map(String).slice(0, 2000), at: v.at, deleted: !!v.deleted }; changed = true; }
  if (changed) { save(); listsChanged?.(); }
}
/** Finds the full path of shared files by name, so playlists made on the phone can play here. */
export async function resolveNames(keys: string[]): Promise<Record<string, string>> {
  await rescan(false);
  const want = new Set(keys.map((k) => k.toLowerCase())); const out: Record<string, string> = {};
  for (const e of files.values()) { const k = e.name.toLowerCase(); if (want.has(k) && !out[k]) out[k] = e.path; }
  return out;
}

/* ---------- Live connection (WebSocket, written by hand so no extra package is needed) ---------- */
const clients = new Set<net.Socket>();
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
function frame(opcode: number, payload: Buffer): Buffer {
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  return Buffer.concat([head, payload]);
}
const sendJson = (sock: net.Socket, v: unknown) => { if (!sock.destroyed) sock.write(frame(0x1, Buffer.from(JSON.stringify(v)))); };
function broadcast(v: unknown) { for (const c of clients) sendJson(c, v); }

function upgrade(req: http.IncomingMessage, sock: net.Socket) {
  const refuse = (code: string) => { sock.write(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); sock.destroy(); };
  if (!isPrivate(req.socket.remoteAddress ?? "")) return refuse("403 Forbidden");
  const url = new URL(req.url ?? "/", "http://x");
  const key = req.headers["sec-websocket-key"];
  if (url.pathname !== "/ws" || typeof key !== "string") return refuse("404 Not Found");
  if (!authed(req, url)) return refuse("401 Unauthorized");
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(sock);
  sock.setNoDelay(true);
  let buf = Buffer.alloc(0);
  sendJson(sock, { type: "hello", name: os.hostname() });
  if (status) sendJson(sock, { type: "status", ...status, online: Date.now() - statusAt < 5000 });
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length > 1_000_000) { sock.destroy(); return; }
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0]! & 0x80) !== 0, op = buf[0]! & 0x0f, masked = (buf[1]! & 0x80) !== 0;
      let len = buf[1]! & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (len > 65536 || !masked || !fin) { sock.destroy(); return; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4); const data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i]! ^= mask[i % 4]!;
      buf = buf.subarray(off + 4 + len);
      if (op === 0x8) { sock.write(frame(0x8, Buffer.alloc(0))); sock.end(); return; }
      if (op === 0x9) { sock.write(frame(0xa, data)); continue; }
      if (op === 0x1) {
        try {
          const m = JSON.parse(data.toString("utf8"));
          if (m?.type === "cmd") void runCommand(m).then((r) => { if (r.code !== 200) sendJson(sock, { type: "error", ...(r.body as object) }); });
        } catch { /* ignore malformed message */ }
      }
    }
  });
  const drop = () => clients.delete(sock);
  sock.on("close", drop); sock.on("error", () => { drop(); sock.destroy(); });
}
setInterval(() => { for (const c of clients) if (!c.destroyed) c.write(frame(0x9, Buffer.alloc(0))); }, 25000).unref?.();

let onChange: (() => void) | null = null;
const notify = () => onChange?.();

export function shareState() {
  return { enabled: !!server, port, addresses: addresses(), code, folders: store.folders, devices: store.tokens.length };
}
export function initShare(changed: () => void) { onChange = changed; load(); }
export function startShare(): Promise<boolean> {
  if (server) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = http.createServer((q, r) => { handle(q, r).catch(() => { try { r.writeHead(500); r.end(); } catch { /* closed */ } }); });
    let tries = 0;
    s.on("upgrade", (req, sock) => upgrade(req, sock as net.Socket));
    s.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EADDRINUSE" && tries++ < 10) { port++; s.listen(port, "0.0.0.0"); } else resolve(false); });
    s.on("listening", () => { server = s; notify(); resolve(true); });
    s.listen(port, "0.0.0.0");
  });
}
export function stopShare() { for (const c of clients) c.destroy(); clients.clear(); server?.close(); server?.closeAllConnections?.(); server = null; notify(); }
export function addFolder(dir: string) { if (!store.folders.includes(dir)) { store.folders.push(dir); treeAt = 0; save(); notify(); } }
export function removeFolder(dir: string) { store.folders = store.folders.filter((f) => f !== dir); treeAt = 0; save(); notify(); }
export function regenerateCode() { code = newCode(); notify(); }
export function forgetDevices() { store.tokens = []; save(); notify(); }
export function putResume(key: string, pos: number, dur: number) { store.sync[key] = { pos, dur, at: Date.now() }; save(); }
export function getResume(key: string): Resume | undefined { return store.sync[key]; }
