import { useEffect, useMemo, useState } from "react";
import { Heart, ListPlus, Play, Shuffle, Trash2, X } from "lucide-react";
import { Media, keyOf, newId, resolve, shuffled } from "./lib";

const put = (l: Partial<Lists>) => window.oneplay.listsPut(l);
export const isFav = (lists: Lists, name: string) => !!lists.fav[keyOf(name)]?.on;
export const toggleFav = (lists: Lists, name: string) => put({ fav: { [keyOf(name)]: { on: !isFav(lists, name), at: Date.now() } } });
const live = (lists: Lists) => Object.values(lists.playlists).filter((p) => !p.deleted).sort((a, b) => b.at - a.at);
const savePlaylist = (p: Playlist) => put({ playlists: { [p.id]: { ...p, at: Date.now() } } });

/** Sidebar content for the Favorites and Playlists tabs. */
export function ListsPane({ mode, lists, queue, onPlay }: { mode: "favs" | "lists"; lists: Lists; queue: Media[]; onPlay: (list: Media[], i: number) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [map, setMap] = useState<Record<string, Media>>({});
  const favNames = useMemo(() => Object.entries(lists.fav).filter(([, v]) => v.on).sort((a, b) => b[1].at - a[1].at).map(([k]) => k), [lists]);
  const pl = open ? lists.playlists[open] : undefined;
  const names = mode === "favs" ? favNames : pl?.items ?? [];
  const sig = names.join("|");
  useEffect(() => { let alive = true; void resolve(names).then((m) => { if (alive) setMap(m); }); return () => { alive = false; }; }, [sig]);
  const playable = names.map((n) => map[keyOf(n)]).filter((m): m is Media => !!m);

  const rows = (
    <>
      {names.length === 0 && <p className="list-empty">{mode === "favs" ? "Tap the heart on a video to add it here." : "This playlist is empty."}</p>}
      {names.map((n, i) => {
        const m = map[keyOf(n)];
        return (
          <div key={n + i} className={`row ${m ? "" : "missing"}`} title={m ? m.path : "Not found on this computer"}>
            <button className="row-main" disabled={!m} onClick={() => m && onPlay(playable, playable.indexOf(m))}>
              <span className="row-icon"><Play size={12} fill="currentColor" /></span><span className="row-name">{m ? m.name : n}</span>
            </button>
            {mode === "lists" && pl && <button className="icon-button small" aria-label="Remove from playlist" onClick={() => savePlaylist({ ...pl, items: pl.items.filter((_, x) => x !== i) })}><X size={13} /></button>}
          </div>
        );
      })}
    </>
  );
  const bar = (
    <div className="pane-actions">
      <button className="chip" disabled={!playable.length} onClick={() => onPlay(playable, 0)}><Play size={12} /> Play</button>
      <button className="chip" disabled={!playable.length} onClick={() => onPlay(shuffled(playable), 0)}><Shuffle size={12} /> Shuffle</button>
    </div>
  );

  if (mode === "favs") return <>{favNames.length > 0 && bar}{rows}</>;
  if (pl) return (
    <>
      <div className="pane-actions">
        <button className="chip" onClick={() => setOpen(null)}>‹ Playlists</button>
        <button className="chip danger" onClick={() => { void put({ playlists: { [pl.id]: { ...pl, deleted: true, at: Date.now() } } }); setOpen(null); }}><Trash2 size={12} /> Delete</button>
      </div>
      <div className="pane-title">{pl.name}</div>
      {bar}{rows}
    </>
  );
  const all = live(lists);
  return (
    <>
      <div className="pane-actions"><button className="chip" disabled={!queue.length} onClick={() => { const name = window.prompt("Playlist name", "My playlist"); if (name?.trim()) void savePlaylist({ id: newId(), name: name.trim(), items: queue.map((m) => m.name), at: 0 }); }}><ListPlus size={12} /> New from queue</button></div>
      {all.length === 0 && <p className="list-empty">No playlists yet. Play some files, then save the queue as a playlist.</p>}
      {all.map((p) => <button key={p.id} className="row" onClick={() => setOpen(p.id)}><span className="row-icon"><ListPlus size={13} /></span><span className="row-name">{p.name}</span><span className="row-count">{p.items.length}</span></button>)}
    </>
  );
}

/** Small dialog to add the current file to a playlist (or a new one). */
export function AddToPlaylist({ media, lists, onClose }: { media: Media; lists: Lists; onClose: () => void }) {
  const add = (p: Playlist) => { if (!p.items.some((n) => keyOf(n) === keyOf(media.name))) void savePlaylist({ ...p, items: [...p.items, media.name] }); onClose(); };
  return (
    <div className="share-overlay" onClick={onClose}>
      <div className="share-panel" role="dialog" aria-label="Add to playlist" onClick={(e) => e.stopPropagation()}>
        <div className="share-head"><h3><ListPlus size={16} /> Add to playlist</h3><button className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <p className="share-note">{media.name}</p>
        <div className="share-folders">
          {live(lists).map((p) => <button key={p.id} className="row" onClick={() => add(p)}><span className="row-name">{p.name}</span><span className="row-count">{p.items.length}</span></button>)}
          <button className="primary-button" onClick={() => { const name = window.prompt("Playlist name", "My playlist"); if (name?.trim()) { void savePlaylist({ id: newId(), name: name.trim(), items: [media.name], at: 0 }); onClose(); } }}><ListPlus size={14} /> New playlist</button>
        </div>
      </div>
    </div>
  );
}
export const FavButton = ({ lists, media }: { lists: Lists; media: Media }) => {
  const on = isFav(lists, media.name);
  return <button className={`icon-button ${on ? "fav-on" : ""}`} title={on ? "Remove from favorites" : "Add to favorites"} aria-pressed={on} onClick={() => void toggleFav(lists, media.name)}><Heart size={16} fill={on ? "currentColor" : "none"} /></button>;
};
