import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { FolderPlus, Wifi, X } from "lucide-react";

export function SharePanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<ShareState | null>(null);
  useEffect(() => { void window.oneplay.shareState().then(setS); return window.oneplay.onShareState(setS); }, []);
  const addr = s?.addresses[0];
  const [qr, setQr] = useState("");
  // The QR holds every address of this computer plus the pairing code, so the phone can connect by scanning.
  const payload = s?.enabled && s.addresses.length ? `oneplay://pair?h=${s.addresses.map((a) => `${a}:${s.port}`).join(",")}&c=${s.code}` : "";
  useEffect(() => { if (!payload) { setQr(""); return; } void QRCode.toDataURL(payload, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setQr); }, [payload]);
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Wi-Fi sharing" onClick={(e) => e.stopPropagation()}>
        <div className="share-head">
          <h3><Wifi size={16} /> Wi-Fi sharing</h3>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="share-note">Let your phone on the same Wi-Fi browse and stream the folders you pick, and continue where you left off.</p>
        <label className="share-switch">
          <input type="checkbox" checked={!!s?.enabled} onChange={(e) => window.oneplay.shareToggle(e.target.checked).then(setS)} />
          <span>{s?.enabled ? "Sharing is on" : "Sharing is off"}</span>
        </label>
        {s?.enabled && qr && (
          <div className="share-qr"><img src={qr} alt="Pairing QR code" width={200} height={200} /><p className="share-note">On your phone open OnePlay, tap the monitor icon, then <b>Scan QR code</b>.</p></div>
        )}
        {s?.enabled && (
          <div className="share-card">
            <div><small>Address for your phone</small><b>{addr ? `${addr}:${s.port}` : "No network found"}</b></div>
            <div><small>Pairing code</small><b className="code">{s.code}</b></div>
            <button className="chip" onClick={() => window.oneplay.shareNewCode().then(setS)}>New code</button>
          </div>
        )}
        <div className="share-folders">
          <div className="share-row"><b>Shared folders</b><button className="chip" onClick={() => window.oneplay.shareAddFolder().then(setS)}><FolderPlus size={13} /> Add folder</button></div>
          {s?.folders.length === 0 && <p className="share-note">No folders yet. Add the folders with your videos.</p>}
          {s?.folders.map((f) => (
            <div key={f} className="share-row"><span className="share-path" title={f}>{f}</span><button className="icon-button" aria-label="Stop sharing this folder" onClick={() => window.oneplay.shareRemoveFolder(f).then(setS)}><X size={14} /></button></div>
          ))}
        </div>
        <div className="share-row foot">
          <small>{s?.devices ?? 0} paired {s?.devices === 1 ? "device" : "devices"}. Only devices on your home network can connect.</small>
          {!!s?.devices && <button className="chip" onClick={() => window.oneplay.shareForget().then(setS)}>Unpair all</button>}
        </div>
      </div>
    </div>
  );
}
