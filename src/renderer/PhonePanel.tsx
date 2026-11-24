import { useState } from "react";
import { Smartphone, X, ChevronLeft, Film, Music } from "lucide-react";
import type { Media } from "./lib";

/** Browse the videos on the paired phone and play them here. The phone app must stay open; files arrive over Wi-Fi as you watch. */
export function PhonePanel({ phone, onClose, onPlay }: { phone: PhoneState; onClose: () => void; onPlay: (list: Media[], index: number) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const folder = phone.folders.find((f) => f.id === open);
  const toMedia = (items: PhoneState["folders"][number]["items"]): Media[] => items.map((i) => ({ path: `${phone.base}/${encodeURIComponent(i.id)}.${(i.name.split(".").pop() ?? "mp4").replace(/[^A-Za-z0-9]/g, "").slice(0, 5) || "mp4"}`, name: i.name }));
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Phone files" onClick={(e) => e.stopPropagation()}>
        <div className="share-head">
          <h3>{folder ? <button className="icon-button" aria-label="Back" onClick={() => setOpen(null)}><ChevronLeft size={16} /></button> : <Smartphone size={16} />} {folder ? folder.name : phone.name || "Phone"}</h3>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="share-note">Plays over Wi-Fi from your phone. Keep OnePlay open on the phone while watching.</p>
        <div className="share-folders">
          {!folder && phone.folders.length === 0 && <p className="share-note">The phone has not sent its list yet.</p>}
          {!folder && phone.folders.map((f) => (
            <button key={f.id} className="share-folder" onClick={() => setOpen(f.id)}><span>{f.name}</span><small>{f.items.length}</small></button>
          ))}
          {folder && folder.items.map((it, i) => (
            <button key={it.id} className="share-folder" onClick={() => onPlay(toMedia(folder.items), i)}>
              <span>{it.kind === "audio" ? <Music size={14} /> : <Film size={14} />} {it.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
