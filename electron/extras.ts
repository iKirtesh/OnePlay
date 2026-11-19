import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app, safeStorage, shell } from "electron";
import { mpvCommand, mpvEnv } from "./mpvpath";

/* ---------- Seek-bar previews and album art (one frame grabbed with mpv) ---------- */
const frames = new Map<string, string>();
let grabbing: ChildProcess | null = null;

export function grabFrame(file: string, time: number, width: number): Promise<string | null> {
  const t = Math.max(0, Math.round(time / 5) * 5); // 5-second buckets keep the cache small
  const key = `${file}|${t}|${width}`;
  const hit = frames.get(key);
  if (hit) return Promise.resolve(hit);
  grabbing?.kill();
  return new Promise((resolve) => {
    let dir = "";
    try { dir = fs.mkdtempSync(path.join(os.tmpdir(), "oneplay-frame-")); } catch { resolve(null); return; }
    const done = (v: string | null) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp cleanup */ } resolve(v); };
    const p = spawn(mpvCommand(), ["--no-config", "--no-audio", "--no-sub", "--really-quiet", "--vo=image", "--vo-image-format=jpg", "--vo-image-jpeg-quality=70", `--vo-image-outdir=${dir}`, `--start=${t}`, "--hr-seek=no", "--frames=1", `--vf=scale=${width}:-2`, file], { stdio: "ignore", windowsHide: true, env: mpvEnv() });
    grabbing = p;
    const timer = setTimeout(() => p.kill(), 8000);
    p.on("error", () => { clearTimeout(timer); done(null); });
    p.on("exit", () => {
      clearTimeout(timer);
      if (grabbing === p) grabbing = null;
      try {
        const f = fs.readdirSync(dir).find((n) => n.endsWith(".jpg"));
        if (!f) return done(null);
        const url = `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, f)).toString("base64")}`;
        if (frames.size > 300) frames.clear();
        frames.set(key, url); done(url);
      } catch { done(null); }
    });
  });
}

/* ---------- Subtitle search (OpenSubtitles.com, needs your own free account and API key) ---------- */
type SubSettings = { apiKey: string; username: string; password: string };
const settingsFile = () => path.join(app.getPath("userData"), "subs.bin");
export function getSubSettings(): SubSettings {
  try {
    const raw = fs.readFileSync(settingsFile());
    const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8");
    const s = JSON.parse(text); return { apiKey: s.apiKey ?? "", username: s.username ?? "", password: s.password ?? "" };
  } catch { return { apiKey: "", username: "", password: "" }; }
}
export function saveSubSettings(s: SubSettings) {
  const text = JSON.stringify({ apiKey: String(s.apiKey ?? "").trim(), username: String(s.username ?? "").trim(), password: String(s.password ?? "") });
  fs.writeFileSync(settingsFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text));
}
const UA = `OnePlay v${app.getVersion()}`;
async function osCall(url: string, init: RequestInit & { key: string; token?: string }): Promise<any> {
  const res = await fetch(url, { ...init, headers: { "Api-Key": init.key, "User-Agent": UA, "Content-Type": "application/json", Accept: "application/json", ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) } });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `OpenSubtitles error ${res.status}`);
  return data;
}
export type SubResult = { fileId: number; release: string; language: string; downloads: number };
export async function searchSubs(query: string, lang: string): Promise<SubResult[]> {
  const { apiKey } = getSubSettings();
  if (!apiKey) throw new Error("Add your OpenSubtitles API key first.");
  const q = new URLSearchParams({ query: query.slice(0, 200), languages: lang || "en", order_by: "download_count", order_direction: "desc" });
  const data = await osCall(`https://api.opensubtitles.com/api/v1/subtitles?${q}`, { key: apiKey });
  return (data.data ?? []).flatMap((d: any) => (d.attributes?.files ?? []).slice(0, 1).map((f: any) => ({ fileId: f.file_id, release: d.attributes.release || f.file_name || d.attributes.feature_details?.title || "Subtitle", language: d.attributes.language ?? lang, downloads: d.attributes.download_count ?? 0 }))).slice(0, 30);
}
/** Downloads a subtitle next to the video (or in a temp folder if that folder is read-only) and returns its path. */
export async function downloadSub(fileId: number, videoPath: string, lang: string): Promise<{ path: string; remaining?: number }> {
  const { apiKey, username, password } = getSubSettings();
  if (!apiKey) throw new Error("Add your OpenSubtitles API key first.");
  if (!username || !password) throw new Error("Downloading needs your OpenSubtitles username and password.");
  const login = await osCall("https://api.opensubtitles.com/api/v1/login", { key: apiKey, method: "POST", body: JSON.stringify({ username, password }) });
  const base = login.base_url ? `https://${String(login.base_url).replace(/^https?:\/\//, "")}` : "https://api.opensubtitles.com";
  const dl = await osCall(`${base}/api/v1/download`, { key: apiKey, token: login.token, method: "POST", body: JSON.stringify({ file_id: fileId, sub_format: "srt" }) });
  if (!dl.link) throw new Error("OpenSubtitles did not return a file.");
  const text = await (await fetch(dl.link)).text();
  const name = `${path.basename(videoPath).replace(/\.[^.]+$/, "")}.${lang || "en"}.srt`;
  let out = path.join(path.dirname(videoPath), name);
  try { fs.writeFileSync(out, text); } catch { out = path.join(os.tmpdir(), name); fs.writeFileSync(out, text); }
  return { path: out, remaining: dl.remaining };
}

/* ---------- Update check against GitHub releases ---------- */
const ver = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
const newer = (a: string, b: string) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); } return false; };
export async function checkUpdate(): Promise<{ version: string; url: string } | null> {
  try {
    const res = await fetch("https://api.github.com/repos/iKirtesh/OnePlay/releases?per_page=20", { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const list = (await res.json()) as { tag_name: string; html_url: string; draft: boolean }[];
    let best: { version: string; url: string } | null = null;
    for (const r of list) {
      if (r.draft || !/^v\d+\.\d+\.\d+$/.test(r.tag_name)) continue;
      if (!best || newer(r.tag_name, best.version)) best = { version: r.tag_name.replace(/^v/, ""), url: r.html_url };
    }
    return best && newer(best.version, app.getVersion()) ? best : null;
  } catch { return null; }
}
export function openRelease(url: string) { if (/^https:\/\/github\.com\/iKirtesh\/OnePlay\//.test(url)) void shell.openExternal(url); }
