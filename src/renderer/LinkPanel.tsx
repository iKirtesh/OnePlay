import { useState } from "react";
import { Link2, X } from "lucide-react";

/** Plays a web link, and can save a copy to Videos/OnePlay while you watch. */
export function LinkPanel({ onClose, onPlay }: { onClose: () => void; onPlay: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [save, setSave] = useState(() => { try { return localStorage.getItem("oneplay.saveWhile") === "1"; } catch { return false; } });
  const go = async () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) return;
    try { localStorage.setItem("oneplay.saveWhile", save ? "1" : "0"); } catch { /* storage unavailable */ }
    if (save) await window.oneplay.setRecord(u);
    onPlay(u);
  };
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Open link" onClick={(e) => e.stopPropagation()}>
        <div className="share-head"><h3><Link2 size={16} /> Open link</h3><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <input id="link-url" aria-label="Video link" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void go(); }} placeholder="https://example.com/video.mp4" style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--sep)", background: "var(--fill)", color: "inherit" }} />
        <label className="share-note" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save a copy to Videos/OnePlay while watching</label>
        <p className="share-note">Plays right away while it downloads. Seeking ahead of what has loaded can leave gaps in the saved copy.</p>
        <button className="primary-button wide" onClick={() => void go()}>Play</button>
      </div>
    </div>
  );
}
