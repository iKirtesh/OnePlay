import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Captions, Settings, EllipsisVertical, SkipBack, SkipForward, Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Minimize2, ChevronDown, ChevronRight, Check, Camera } from "lucide-react";

/** On-screen controls drawn in a transparent window over mpv's full-screen video. */
type Track = { id: number; type: string; lang?: string; title?: string; selected?: boolean; albumart?: boolean };
type Menu = null | "speed" | "subs" | "settings" | "more";
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ASPECTS: { id: string; label: string }[] = [{ id: "auto", label: "Auto" }, { id: "16:9", label: "16:9" }, { id: "4:3", label: "4:3" }, { id: "21:9", label: "21:9" }, { id: "fill", label: "Fill" }, { id: "stretch", label: "Stretch" }];
const clock = (s: number) => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${String(x).padStart(2, "0")}`; };
const trackName = (t: Track, i: number) => [t.title || `Track ${i + 1}`, t.lang ? `(${t.lang})` : ""].filter(Boolean).join(" ");

export function Overlay() {
  const [s, setS] = useState<Record<string, any>>({});
  const [shown, setShown] = useState(true);
  const [menu, setMenu] = useState<Menu>(null);
  const [page, setPage] = useState<"root" | "audio" | "aspect">("root");
  const [aspect, setAspect] = useState("auto");
  const [loop, setLoop] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactive = useRef(false);
  const menuRef = useRef<Menu>(null); menuRef.current = menu;

  useEffect(() => {
    document.documentElement.classList.add("ov-root");
    void window.oneplay.overlayState().then((v) => setS((p) => ({ ...v, ...p })));
    return window.oneplay.onStatus((m: any) => { if (m.event === "property-change") setS((p) => ({ ...p, [m.name]: m.data })); });
  }, []);

  const poke = useCallback(() => {
    setShown(true);
    if (hide.current) clearTimeout(hide.current);
    hide.current = setTimeout(() => { if (!menuRef.current && !interactive.current) { setShown(false); } }, 2800);
  }, []);
  useEffect(() => { poke(); }, [poke]);

  // The overlay lets the mouse pass through to mpv except over its own controls.
  const onMove = (e: React.MouseEvent) => {
    poke();
    const over = !!(e.target as HTMLElement).closest(".hit");
    if (over !== interactive.current) { interactive.current = over; void window.oneplay.overlayInteractive(over); }
  };

  const tracks: Track[] = Array.isArray(s["track-list"]) ? s["track-list"] : [];
  const subs = tracks.filter((t) => t.type === "sub");
  const audio = tracks.filter((t) => t.type === "audio");
  const subOn = subs.find((t) => t.selected);
  const audioOn = audio.find((t) => t.selected);
  const pos = Number(s["time-pos"]) || 0, dur = Number(s.duration) || 0;
  const speed = Number(s.speed) || 1;
  const volume = Number(s.volume) || 0;
  const paused = !!s.pause;
  const close = () => { setMenu(null); setPage("root"); };
  const toggleMenu = (m: Exclude<Menu, null>) => { setPage("root"); setMenu((cur) => (cur === m ? null : m)); poke(); };

  return (
    <div className={`ov ${shown || menu ? "on" : ""}`} onMouseMove={onMove} onMouseLeave={() => { interactive.current = false; void window.oneplay.overlayInteractive(false); }}>
      <div className="ov-top hit">
        <button className="ov-btn" aria-label="Back to OnePlay" onClick={() => void window.oneplay.overlayBack()}><ArrowLeft size={26} /></button>
        <div className="ov-title">{String(s["media-title"] ?? "")}</div>
        <button className={`ov-chip ${speed !== 1 ? "hot" : ""}`} aria-label="Playback speed" onClick={() => toggleMenu("speed")}>{speed}x</button>
        <button className={`ov-btn ${subOn ? "hot" : ""}`} aria-label="Subtitles" onClick={() => toggleMenu("subs")}><Captions size={24} /></button>
        <button className="ov-btn" aria-label="Settings" onClick={() => toggleMenu("settings")}><Settings size={24} /></button>
        <button className="ov-btn" aria-label="More" onClick={() => toggleMenu("more")}><EllipsisVertical size={24} /></button>
      </div>

      {menu && (
        <div className="ov-menu hit" role="menu">
          {menu === "speed" && <>
            <div className="ov-mh">Playback speed<button className="ov-x" aria-label="Close" onClick={close}>×</button></div>
            {SPEEDS.map((v) => <button key={v} className="ov-row" onClick={() => { void window.oneplay.setSpeed(v); close(); }}><span>{v}x</span>{v === speed && <Check size={16} />}</button>)}
          </>}
          {menu === "subs" && <>
            <div className="ov-mh">Subtitles<button className="ov-x" aria-label="Close" onClick={close}>×</button></div>
            <button className="ov-row" onClick={() => { void window.oneplay.setTrack("sub", null); close(); }}><span>Off</span>{!subOn && <Check size={16} />}</button>
            {subs.map((t, i) => <button key={t.id} className="ov-row" onClick={() => { void window.oneplay.setTrack("sub", t.id); close(); }}><span>{trackName(t, i)}</span>{t.selected && <Check size={16} />}</button>)}
            <button className="ov-row" onClick={() => { void window.oneplay.addSubtitle(); close(); }}><span>Load subtitle file…</span></button>
          </>}
          {menu === "settings" && page === "root" && <>
            <div className="ov-mh">Settings<button className="ov-x" aria-label="Close" onClick={close}>×</button></div>
            {audio.length > 1 && <button className="ov-row" onClick={() => setPage("audio")}><span>Audio track</span><em>{audioOn ? trackName(audioOn, audio.indexOf(audioOn)) : "Auto"} <ChevronRight size={14} /></em></button>}
            <button className="ov-row" onClick={() => setPage("aspect")}><span>Aspect ratio</span><em>{ASPECTS.find((a) => a.id === aspect)?.label} <ChevronRight size={14} /></em></button>
            <button className="ov-row" onClick={() => { const v = !loop; setLoop(v); void window.oneplay.setLoop(v); }}><span>Loop video</span><i className={`ov-sw ${loop ? "on" : ""}`}><b /></i></button>
          </>}
          {menu === "settings" && page === "audio" && <>
            <div className="ov-mh"><button className="ov-x back" aria-label="Back" onClick={() => setPage("root")}>‹</button>Audio track</div>
            {audio.map((t, i) => <button key={t.id} className="ov-row" onClick={() => { void window.oneplay.setTrack("audio", t.id); setPage("root"); }}><span>{trackName(t, i)}</span>{t.selected && <Check size={16} />}</button>)}
          </>}
          {menu === "settings" && page === "aspect" && <>
            <div className="ov-mh"><button className="ov-x back" aria-label="Back" onClick={() => setPage("root")}>‹</button>Aspect ratio</div>
            {ASPECTS.map((a) => <button key={a.id} className="ov-row" onClick={() => { setAspect(a.id); void window.oneplay.setAspect(a.id); setPage("root"); }}><span>{a.label}</span>{a.id === aspect && <Check size={16} />}</button>)}
          </>}
          {menu === "more" && <>
            <div className="ov-mh">More<button className="ov-x" aria-label="Close" onClick={close}>×</button></div>
            <button className="ov-row" onClick={() => { void window.oneplay.screenshot(); close(); }}><span>Screenshot</span><Camera size={16} /></button>
            <button className="ov-row" onClick={() => { void window.oneplay.frameStep(true); close(); }}><span>Previous frame</span></button>
            <button className="ov-row" onClick={() => { void window.oneplay.frameStep(false); close(); }}><span>Next frame</span></button>
            <button className="ov-row" onClick={() => { void window.oneplay.abLoop(); close(); }}><span>A-B repeat</span></button>
            <button className="ov-row" onClick={() => void window.oneplay.overlayBack()}><span>Show OnePlay window</span></button>
          </>}
        </div>
      )}

      <div className="ov-bottom hit">
        <div className="ov-seek">
          <span>{clock(pos)}</span>
          <input aria-label="Seek" type="range" min={0} max={Math.max(dur, 1)} step={0.1} value={Math.min(pos, dur || 0)} style={{ ["--p" as string]: `${dur ? (pos / dur) * 100 : 0}%` }} onChange={(e) => void window.oneplay.seek(Number(e.target.value))} />
          <span>-{clock(dur - pos)}</span>
        </div>
        <div className="ov-row3">
          <div className="ov-left"><button className="ov-chip wide" aria-label="Aspect ratio" onClick={() => { const i = ASPECTS.findIndex((a) => a.id === aspect); const n = ASPECTS[(i + 1) % ASPECTS.length]!; setAspect(n.id); void window.oneplay.setAspect(n.id); }}>{ASPECTS.find((a) => a.id === aspect)?.label} <ChevronDown size={16} /></button></div>
          <div className="ov-mid">
            <button className="ov-btn" aria-label="Back 10 seconds" onClick={() => void window.oneplay.seekBy(-10)}><RotateCcw size={28} /></button>
            <button className="ov-btn" aria-label="Previous" onClick={() => void window.oneplay.overlayNext(-1)}><SkipBack size={26} /></button>
            <button className="ov-btn big" aria-label={paused ? "Play" : "Pause"} onClick={() => void window.oneplay.togglePause()}>{paused ? <Play size={44} fill="currentColor" /> : <Pause size={44} fill="currentColor" />}</button>
            <button className="ov-btn" aria-label="Next" onClick={() => void window.oneplay.overlayNext(1)}><SkipForward size={26} /></button>
            <button className="ov-btn" aria-label="Forward 10 seconds" onClick={() => void window.oneplay.seekBy(10)}><RotateCw size={28} /></button>
          </div>
          <div className="ov-right">
            <button className="ov-btn" aria-label={s.mute ? "Unmute" : "Mute"} onClick={() => void window.oneplay.setMute(!s.mute)}>{s.mute || volume === 0 ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
            <input aria-label="Volume" type="range" min={0} max={150} value={s.mute ? 0 : volume} style={{ ["--p" as string]: `${(s.mute ? 0 : volume) / 1.5}%` }} onChange={(e) => void window.oneplay.setVolume(Number(e.target.value))} />
            <button className="ov-btn" aria-label="Exit full screen" onClick={() => void window.oneplay.overlayBack()}><Minimize2 size={24} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
