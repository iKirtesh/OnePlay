import { useEffect, useState } from "react";
import { Cast, X } from "lucide-react";

type Dev = { name: string; control: string; location: string };

/** Sends the current video to a smart TV or speaker on the same Wi-Fi (DLNA / UPnP). */
export function CastPanel({ path, title, onClose }: { path: string; title: string; onClose: () => void }) {
  const [devs, setDevs] = useState<Dev[] | null>(null);
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState<Dev | null>(null);
  const scan = () => { setDevs(null); setMsg(""); void window.oneplay.castDiscover().then(setDevs).catch(() => setDevs([])); };
  useEffect(scan, []);
  const go = async (d: Dev) => {
    setMsg(`Sending to ${d.name}…`);
    const r = await window.oneplay.castPlay(d.control, path, title);
    if (r.ok) { setActive(d); setMsg(`Playing on ${d.name}. Local playback is paused.`); } else setMsg(r.error ?? "Could not cast.");
  };
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Cast to TV" onClick={(e) => e.stopPropagation()}>
        <div className="share-head"><h3><Cast size={16} /> Cast to TV</h3><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="share-note">Works with smart TVs and speakers that support DLNA (Samsung, LG, Sony, many others). The video's folder must be shared in Wi-Fi sharing. Not for Chromecast or Apple TV.</p>
        <div className="share-folders">
          {devs === null && <p className="share-note">Looking for devices…</p>}
          {devs?.length === 0 && <p className="share-note">No devices found. Make sure the TV is on and on the same Wi-Fi.</p>}
          {devs?.map((d) => <button key={d.control} className="share-folder" onClick={() => void go(d)}><span>{d.name}</span></button>)}
        </div>
        {msg && <p className="share-note">{msg}</p>}
        <div className="share-folders">
          <button className="share-folder" onClick={scan}><span>Search again</span></button>
          {active && <button className="share-folder" onClick={() => { void window.oneplay.castStop(active.control); setActive(null); setMsg("Stopped."); }}><span>Stop casting</span></button>}
        </div>
      </div>
    </div>
  );
}
