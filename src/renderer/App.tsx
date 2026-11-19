import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SharePanel } from "./Share";
import { Wifi, AudioLines, Camera, Captions, Clock, Languages, Layers, PictureInPicture2, Repeat1, StepForward, FolderOpen, ListMusic, Maximize2, Pause, Play, Repeat, RotateCcw, RotateCw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

type Media = { path: string; name: string };
type Tab = "queue" | "recent";
const MEDIA_EXT = /\.(mp4|mkv|avi|mov|webm|m4v|mp3|flac|wav|aac|ogg|opus|m4a|wmv|ts)$/i;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RECENT_KEY = "oneplay.recent";
const RESUME_KEY = "oneplay.resume";
const readResume = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(RESUME_KEY) || "{}"); } catch { return {}; } };
const shareKey = (path: string) => (path.split(/[\\/]/).pop() || path).replace(/\.[^.]+$/, "");
const writeResume = (path: string, pos: number, dur: number) => { const done = dur > 0 && (pos < 5 || pos > dur - 10); void window.oneplay.shareResume(shareKey(path), done ? 0 : pos, dur); try { const r = readResume(); if (dur > 0 && (pos < 5 || pos > dur - 10)) delete r[path]; else r[path] = pos; localStorage.setItem(RESUME_KEY, JSON.stringify(r)); } catch { /* storage unavailable */ } };

const toMedia = (path: string): Media => ({ path, name: (path.split(/[\\/]/).pop() || path).replace(/\.[^.]+$/, "") });
const clock = (n: number) => {
  if (!Number.isFinite(n) || n < 0) return "0:00";
  const s = Math.floor(n), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
function loadRecent(): Media[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v.filter((m) => m && typeof m.path === "string").slice(0, 12) : []; } catch { return []; }
}

export default function App() {
  const [queue, setQueue] = useState<Media[]>([]);
  const [index, setIndex] = useState(-1);
  const [recent, setRecent] = useState<Media[]>(loadRecent);
  const [tab, setTab] = useState<Tab>("queue");
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [chapters, setChapters] = useState<{ title?: string; time: number }[]>([]);
  const [chapter, setChapter] = useState(-1);
  const [onTop, setOnTop] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const pendingResume = useRef(0);
  const lastSave = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const current = index >= 0 ? queue[index] ?? null : null;
  const platform = window.oneplay.platform;

  // Latest values for the long-lived listeners below.
  const live = useRef({ queue, index, loop, position, duration });
  live.current = { queue, index, loop, position, duration };

  const updateVideoBounds = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = stage.getBoundingClientRect();
    void window.oneplay.setVideoBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ro = new ResizeObserver(updateVideoBounds);
    ro.observe(stage);
    window.addEventListener("resize", updateVideoBounds);
    updateVideoBounds();
    return () => { ro.disconnect(); window.removeEventListener("resize", updateVideoBounds); };
  }, [updateVideoBounds]);

  const playAt = useCallback(async (list: Media[], i: number) => {
    const item = list[i];
    if (!item) return;
    if (live.current.index >= 0) { const c = live.current.queue[live.current.index]; if (c) writeResume(c.path, live.current.position, live.current.duration); }
    pendingResume.current = readResume()[item.path] ?? 0;
    try { const r = await window.oneplay.getShareResume(shareKey(item.path)); if (r) pendingResume.current = r.pos; } catch { /* sharing unavailable */ }
    setChapters([]); setChapter(-1);
    setQueue(list); setIndex(i); setError(""); setInfo(""); setPosition(0);
    setRecent((prev) => {
      const next = [item, ...prev.filter((m) => m.path !== item.path)].slice(0, 12);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
    updateVideoBounds();
    await window.oneplay.setLoop(live.current.loop);
    await window.oneplay.play(item.path);
  }, [updateVideoBounds]);

  const next = useCallback((step: 1 | -1) => {
    const { queue: q, index: i } = live.current;
    if (q.length < 2) return false;
    void playAt(q, (i + step + q.length) % q.length);
    return true;
  }, [playAt]);

  useEffect(() => window.oneplay.onStatus((s: any) => {
    if (s.event === "property-change") {
      const { name, data } = s;
      if (name === "pause") setPaused(Boolean(data));
      if (name === "time-pos" && typeof data === "number") {
        setPosition(data);
        const { queue: q, index: i, duration: d } = live.current;
        if (i >= 0 && q[i] && Date.now() - lastSave.current > 5000) { lastSave.current = Date.now(); writeResume(q[i]!.path, data, d); }
      }
      if (name === "chapter-list" && Array.isArray(data)) setChapters(data);
      if (name === "chapter" && typeof data === "number") setChapter(data);
      if (name === "duration" && typeof data === "number") { setDuration(data); if (pendingResume.current > 5) { void window.oneplay.seek(pendingResume.current); setInfo(`Resumed at ${clock(pendingResume.current)}`); pendingResume.current = 0; } }
      if (name === "volume" && typeof data === "number") setVolume(data);
      if (name === "mute") setMuted(Boolean(data));
      if (name === "speed" && typeof data === "number") setSpeed(data);
      // mpv keeps the last frame (keep-open), so end of file is our cue to advance the queue.
      if (name === "eof-reached" && data === true && !live.current.loop) {
        const { queue: q, index: i } = live.current;
        if (i >= 0 && i < q.length - 1) void playAt(q, i + 1);
      }
    }
    if (s.event === "error") setError(s.message);
    if (s.event === "info") setInfo(s.message);
  }), [playAt]);

  useEffect(() => window.oneplay.onFullscreen(setFullscreen), []);

  const openFiles = async () => {
    const files = await window.oneplay.openFile();
    if (files.length) { const items = files.map(toMedia); await playAt(items, 0); }
  };
  const toggle = async () => { if (!current) return openFiles(); await window.oneplay.togglePause(); };
  const skip = (delta: number) => window.oneplay.seek(Math.max(0, Math.min(live.current.duration || Infinity, live.current.position + delta)));
  const changeVolume = (v: number) => { setVolume(v); void window.oneplay.setVolume(v); if (v > 0 && muted) void window.oneplay.setMute(false); };
  const cycleSpeed = () => { const n = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1; setSpeed(n); void window.oneplay.setSpeed(n); };
  const toggleLoop = () => { const v = !loop; setLoop(v); void window.oneplay.setLoop(v); };

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range" || t.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); void toggle(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); void skip(e.shiftKey ? -30 : -5); }
      else if (e.key === "ArrowRight") { e.preventDefault(); void skip(e.shiftKey ? 30 : 5); }
      else if (e.key === "ArrowUp") { e.preventDefault(); changeVolume(Math.min(100, volume + 5)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); changeVolume(Math.max(0, volume - 5)); }
      else if (k === "m") { void window.oneplay.setMute(!muted); }
      else if (k === "f") { void window.oneplay.toggleFullscreen(); }
      else if (k === "n") next(1);
      else if (k === "p") next(-1);
      else if (k === "l") toggleLoop();
      else if (k === "s") void window.oneplay.cycleSub();
      else if (k === "a") void window.oneplay.cycleAudio();
      else if (k === "b") void window.oneplay.abLoop();
      else if (k === ".") void window.oneplay.frameStep(false);
      else if (k === ",") void window.oneplay.frameStep(true);
      else if (k === "c") void window.oneplay.screenshot();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Drag and drop files onto the window.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const paths = [...e.dataTransfer.files].map((f) => window.oneplay.pathForFile(f)).filter((p) => p && MEDIA_EXT.test(p));
    if (paths.length) await playAt(paths.map(toMedia), 0);
    else if (e.dataTransfer.files.length) setError("That file type is not a supported audio or video format.");
  };

  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const upNext = useMemo(() => (index >= 0 ? queue.slice(index + 1) : queue), [queue, index]);
  const list = tab === "queue" ? queue : recent;

  return (
    <main
      className={`shell ${platform} ${fullscreen ? "is-fullscreen" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      <aside className="sidebar">
        <div className="drag-strip" />
        <div className="brand"><div className="brand-mark"><Play size={14} fill="currentColor" /></div><span>OnePlay</span></div>
        <button className="primary-button" onClick={openFiles}><FolderOpen size={15} /> Open media…</button>
        <div className="segmented" role="tablist" aria-label="Library">
          <button role="tab" aria-selected={tab === "queue"} className={tab === "queue" ? "on" : ""} onClick={() => setTab("queue")}><ListMusic size={13} /> Queue</button>
          <button role="tab" aria-selected={tab === "recent"} className={tab === "recent" ? "on" : ""} onClick={() => setTab("recent")}><Clock size={13} /> Recent</button>
        </div>
        <div className="list" role="list">
          {list.length === 0 && <p className="list-empty">{tab === "queue" ? "Open or drop files to build your queue." : "Files you play will appear here."}</p>}
          {list.map((m, i) => {
            const playing = current?.path === m.path;
            return (
              <button key={`${m.path}-${i}`} role="listitem" className={`row ${playing ? "playing" : ""}`} title={m.path}
                onClick={() => (tab === "queue" ? playAt(queue, i) : playAt([m, ...recent.filter((r) => r.path !== m.path)], 0))}>
                <span className="row-icon">{playing && !paused ? <AudioLines size={14} /> : <Play size={12} fill="currentColor" />}</span>
                <span className="row-name">{m.name}</span>
              </button>
            );
          })}
        </div>
        <div className="sidebar-foot"><span className="dot" /> mpv engine</div>
      </aside>

      <section className="workspace">
        <header className="titlebar">
          <div className="title-text">{current ? current.name : "OnePlay"}</div>
          <div className="title-actions">
            <button className="icon-button" title="Wi-Fi sharing and phone sync" onClick={() => setShareOpen(true)}><Wifi size={16} /></button>
            <button className="icon-button" title="Load subtitles" onClick={() => window.oneplay.addSubtitle()}><Captions size={17} /></button>
            <button className="icon-button" title="Cycle subtitles (S)" onClick={() => window.oneplay.cycleSub()}><Layers size={16} /></button>
            <button className="icon-button" title="Cycle audio track (A)" onClick={() => window.oneplay.cycleAudio()}><Languages size={16} /></button>
            <button className="icon-button" title="Screenshot (C)" onClick={() => window.oneplay.screenshot()}><Camera size={16} /></button>
            <button className={`icon-button ${onTop ? "active" : ""}`} title="Mini player (stay on top)" onClick={async () => setOnTop(await window.oneplay.toggleOnTop())}><PictureInPicture2 size={16} /></button>
            <button className="icon-button" title="Open media" onClick={openFiles}><FolderOpen size={17} /></button>
            <button className="icon-button" title="Fullscreen (F)" onClick={() => window.oneplay.toggleFullscreen()}><Maximize2 size={16} /></button>
          </div>
        </header>

        <div className="content">
          <div className={`video-stage ${current ? "has-media" : ""}`} ref={stageRef}>
            {!current && (
              <div className="empty-state">
                <div className="empty-icon"><Play size={30} fill="currentColor" /></div>
                <h2>Drop a video here</h2>
                <p>Or open a file. MP4, MKV, MOV, WebM, MP3, FLAC and more.</p>
                <button className="primary-button wide" onClick={openFiles}><FolderOpen size={15} /> Open media</button>
              </div>
            )}
            {info && <div className="stage-notice">{info}</div>}
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}

          <section className="transport" aria-label="Playback controls">
            <div className="now"><b>{current ? current.name : "Not playing"}</b><span>{upNext.length ? `${upNext.length} up next` : current ? "Last in queue" : "Nothing queued"}</span></div>
            <div className="timeline">
              <span>{clock(position)}</span>
              <input aria-label="Seek" type="range" min={0} max={Math.max(duration, 1)} step={0.1} value={Math.min(position, duration || 0)}
                style={{ ["--p" as string]: `${pct}%` }} onChange={(e) => window.oneplay.seek(Number(e.target.value))} />
              <span>-{clock(Math.max(0, duration - position))}</span>
            </div>
            <div className="controls">
              <div className="side">
                <button className={`icon-button ${loop ? "active" : ""}`} aria-pressed={loop} title="Repeat this file (L)" onClick={toggleLoop}><Repeat size={17} /></button>
                <button className="chip" title="Playback speed" onClick={cycleSpeed}>{speed}×</button>
                <button className="icon-button" title="A-B repeat (B)" onClick={() => window.oneplay.abLoop()}><Repeat1 size={17} /></button>
                <button className="icon-button" title="Next frame (.)" onClick={() => window.oneplay.frameStep(false)}><StepForward size={17} /></button>
                {chapters.length > 0 && (
                  <select className="chip" aria-label="Chapters" value={chapter} onChange={(e) => window.oneplay.setChapter(Number(e.target.value))}>
                    {chapters.map((c, i) => <option key={i} value={i}>{c.title || `Chapter ${i + 1}`}</option>)}
                  </select>
                )}
              </div>
              <div className="main-controls">
                <button className="icon-button" title="Previous (P)" disabled={queue.length < 2} onClick={() => next(-1)}><SkipBack size={20} fill="currentColor" /></button>
                <button className="icon-button" title="Back 10 seconds" onClick={() => skip(-10)}><RotateCcw size={20} /></button>
                <button className="play-button" aria-label={paused ? "Play" : "Pause"} onClick={toggle}>{paused ? <Play size={22} fill="currentColor" /> : <Pause size={22} fill="currentColor" />}</button>
                <button className="icon-button" title="Forward 10 seconds" onClick={() => skip(10)}><RotateCw size={20} /></button>
                <button className="icon-button" title="Next (N)" disabled={queue.length < 2} onClick={() => next(1)}><SkipForward size={20} fill="currentColor" /></button>
              </div>
              <div className="side volume">
                <button className="icon-button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => window.oneplay.setMute(!muted)}>{muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
                <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} style={{ ["--p" as string]: `${muted ? 0 : volume}%` }} onChange={(e) => changeVolume(Number(e.target.value))} />
              </div>
            </div>
          </section>
        </div>
      </section>
      {shareOpen && <SharePanel onClose={() => setShareOpen(false)} />}
      {dragging && <div className="drop-overlay"><div>Drop to play</div></div>}
    </main>
  );
}
