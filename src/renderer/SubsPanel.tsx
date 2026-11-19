import { useEffect, useState } from "react";
import { Download, Search, Settings, X } from "lucide-react";
import { Media } from "./lib";

const LANGS: [string, string][] = [["en", "English"], ["hi", "Hindi"], ["mr", "Marathi"], ["ta", "Tamil"], ["te", "Telugu"], ["bn", "Bengali"], ["ur", "Urdu"], ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["pt-BR", "Portuguese (BR)"], ["ar", "Arabic"], ["ru", "Russian"], ["ja", "Japanese"], ["ko", "Korean"], ["zh-CN", "Chinese"]];
// Strip release junk (resolution, codec, group tags) so the search finds the title.
const clean = (n: string) => n.replace(/[._]+/g, " ").replace(/\b(2160p|1080p|720p|480p|4k|hdtc|hdrip|webrip|web-dl|bluray|brrip|x26[45]|hevc|10bit|aac|ddp?5?\.?1|atmos|hdr)\b.*$/i, "").replace(/[\[\(].*$/, "").trim();

export function SubsPanel({ media, onClose }: { media: Media; onClose: () => void }) {
  const [cfg, setCfg] = useState({ apiKey: "", username: "", password: "", hasPassword: false });
  const [setup, setSetup] = useState(false);
  const [q, setQ] = useState(clean(media.name));
  const [lang, setLang] = useState("en");
  const [results, setResults] = useState<{ fileId: number; release: string; language: string; downloads: number }[]>([]);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { void window.oneplay.subsGet().then((s) => { setCfg({ apiKey: s.apiKey, username: s.username, password: "", hasPassword: s.hasPassword }); if (!s.apiKey) setSetup(true); }); }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); } finally { setBusy(false); } };
  const search = () => run(async () => { const r = await window.oneplay.subsSearch(q, lang); setResults(r); if (!r.length) setMsg("No subtitles found. Try a shorter title."); });
  const get = (id: number) => run(async () => { const r = await window.oneplay.subsDownload(id, media.path, lang); setMsg(`Loaded. ${r.remaining != null ? `${r.remaining} downloads left today.` : ""}`); });
  const save = () => run(async () => { await window.oneplay.subsSave({ apiKey: cfg.apiKey, username: cfg.username, password: cfg.password }); setSetup(false); setMsg("Saved."); });
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Find subtitles" onClick={(e) => e.stopPropagation()}>
        <div className="share-head"><h3><Search size={16} /> Find subtitles</h3><span><button className="icon-button" aria-label="Account settings" onClick={() => setSetup((v) => !v)}><Settings size={15} /></button><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></span></div>
        {setup ? (
          <div className="share-folders">
            <p className="share-note">Subtitles come from OpenSubtitles.com. Create a free account, then add an API key under your profile (API consumers) and enter it here. Your details stay on this computer.</p>
            <input className="field" placeholder="API key" value={cfg.apiKey} onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} />
            <input className="field" placeholder="Username" value={cfg.username} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} />
            <input className="field" type="password" placeholder={cfg.hasPassword ? "Password (saved, leave empty to keep)" : "Password"} value={cfg.password} onChange={(e) => setCfg({ ...cfg, password: e.target.value })} />
            <button className="primary-button" disabled={busy || !cfg.apiKey} onClick={save}>Save</button>
          </div>
        ) : (
          <>
            <div className="share-row"><input className="field grow" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} aria-label="Title" />
              <select className="chip" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
              <button className="chip" disabled={busy || !q.trim()} onClick={search}><Search size={13} /> Search</button></div>
            <div className="share-folders results">
              {results.map((r) => <div key={r.fileId} className="share-row"><span className="share-path" title={r.release}>{r.release}</span><small>{r.downloads.toLocaleString()}</small><button className="icon-button" aria-label="Download and use" disabled={busy} onClick={() => get(r.fileId)}><Download size={15} /></button></div>)}
            </div>
          </>
        )}
        {msg && <p className="share-note" role="status">{msg}</p>}
      </div>
    </div>
  );
}
