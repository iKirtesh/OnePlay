import { useEffect, useState } from "react";
import { AudioLines, FolderOpen, ListMusic, Maximize2, MoreHorizontal, Pause, Play, Repeat2, SkipBack, SkipForward, Volume2, Waves } from "lucide-react";

type Media = { path: string; name: string };
export default function App() {
  const [queue, setQueue] = useState<Media[]>([]);
  const [current, setCurrent] = useState<Media | null>(null);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [error, setError] = useState("");

  useEffect(() => window.oneplay.onStatus((status: any) => {
    if (status.event === "property-change") {
      const { name, data } = status;
      if (name === "pause") setPaused(Boolean(data));
      if (name === "time-pos" && typeof data === "number") setPosition(data);
      if (name === "duration" && typeof data === "number") setDuration(data);
      if (name === "volume" && typeof data === "number") setVolume(data);
    }
    if (status.event === "error") setError(status.message);
  }), []);

  const openFiles = async () => {
    const files = await window.oneplay.openFile();
    if (!files.length) return;
    const items = files.map(path => ({ path, name: path.split(/[\\/]/).pop() || path }));
    setQueue(items);
    setCurrent(items[0]);
    setError("");
    await window.oneplay.play(items[0].path);
  };
  const toggle = async () => {
    if (!current) return openFiles();
    await window.oneplay.togglePause();
  };
  const format = (n: number) => {
    if (!Number.isFinite(n)) return "00:00";
    const s = Math.floor(n);
    return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
  };

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Play size={17} fill="currentColor"/></div><span>OnePlay</span></div>
      <div className="nav-label">LIBRARY</div>
      <button className="nav-item active"><Waves size={17}/> Now Playing</button>
      <button className="nav-item" onClick={openFiles}><FolderOpen size={17}/> Open media</button>
      <button className="nav-item"><ListMusic size={17}/> Playlists</button>
      <div className="sidebar-bottom"><div className="engine-pill"><span/> mpv engine</div><small>OnePlay · 0.1.0</small></div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div className="crumb">Your library <span>/</span> <b>Now Playing</b></div><div className="top-actions"><button className="icon-button" onClick={openFiles}><FolderOpen size={18}/></button><button className="icon-button"><MoreHorizontal size={19}/></button></div></header>
      <div className="content">
        <div className="eyebrow">ONEPLAY PLAYER</div>
        <h1>{current ? current.name : "A little space for your media."}</h1>
        <p className="subheading">{current ? "Now playing on OnePlay" : "Your music and movies, beautifully together."}</p>
        <div className="video-stage">
          {!current ? <div className="empty-state"><div className="empty-icon"><AudioLines size={34}/></div><h2>Ready when you are.</h2><p>Open a video or audio file to get started.</p><button className="primary-button" onClick={openFiles}><FolderOpen size={16}/> Open media</button></div> :
            <div className="playing-state"><div className="playing-orb"><AudioLines size={48}/></div><span>PLAYING IN MPV</span><small>{current.path}</small></div>}
          <button className="stage-expand" title="Fullscreen (coming soon)"><Maximize2 size={17}/></button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <section className="transport">
          <div className="timeline"><span>{format(position)}</span><input aria-label="Seek" type="range" min="0" max={Math.max(duration,1)} value={Math.min(position,duration || 0)} onChange={e => window.oneplay.seek(Number(e.target.value))}/><span>{format(duration)}</span></div>
          <div className="controls">
            <div className="control-side"><button className="control-button" onClick={() => window.oneplay.seek(Math.max(0,position-10))}><SkipBack size={19}/></button><button className="control-button"><Repeat2 size={18}/></button></div>
            <div className="main-controls"><button className="control-button" onClick={() => window.oneplay.seek(Math.max(0,position-5))}><SkipBack size={20}/></button><button className="play-button" onClick={toggle}>{paused ? <Play size={21} fill="currentColor"/> : <Pause size={21} fill="currentColor"/>}</button><button className="control-button" onClick={() => window.oneplay.seek(Math.min(duration,position+5))}><SkipForward size={20}/></button></div>
            <div className="control-side volume"><Volume2 size={18}/><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e => { const v=Number(e.target.value); setVolume(v); window.oneplay.setVolume(v); }}/></div>
          </div>
        </section>
        <section className="bottom-row"><div><div className="section-title">UP NEXT</div><p>{queue.length ? `${queue.length} item(s) in your session` : "Your queue is looking peaceful."}</p></div><button className="text-button" onClick={openFiles}>Add media <span>＋</span></button></section>
      </div>
    </section>
  </main>;
}
