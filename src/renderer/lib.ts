export type Media = { path: string; name: string };
export const AUDIO_EXT = /\.(mp3|flac|wav|aac|ogg|opus|m4a)$/i;
export const baseName = (p: string) => (p.split(/[\\/]/).pop() || p).replace(/\.[^.]+$/, "");
export const keyOf = (name: string) => name.toLowerCase();

const KNOWN = "oneplay.known";
type Known = Record<string, Media>;
const readKnown = (): Known => { try { return JSON.parse(localStorage.getItem(KNOWN) || "{}"); } catch { return {}; } };
/** Remembers where files live so playlists and favorites made anywhere can be played here. */
export function remember(list: Media[]) {
  try {
    const k = readKnown();
    for (const m of list) if (m.path) k[keyOf(m.name)] = m;
    const keys = Object.keys(k);
    if (keys.length > 3000) for (const x of keys.slice(0, keys.length - 3000)) delete k[x];
    localStorage.setItem(KNOWN, JSON.stringify(k));
  } catch { /* storage unavailable */ }
}
export const knownMedia = (name: string): Media | undefined => readKnown()[keyOf(name)];
/** Finds a playable path for each name: files played before, then files in the folders shared over Wi-Fi. */
export async function resolve(names: string[]): Promise<Record<string, Media>> {
  const known = readKnown(); const out: Record<string, Media> = {}; const missing: string[] = [];
  for (const n of names) { const k = keyOf(n); if (known[k]) out[k] = known[k]; else missing.push(n); }
  if (missing.length) {
    try {
      const found = await window.oneplay.resolveNames(missing);
      for (const n of missing) { const p = found[keyOf(n)]; if (p) out[keyOf(n)] = { path: p, name: n }; }
      remember(Object.values(out));
    } catch { /* sharing not available */ }
  }
  return out;
}
export function shuffled<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; }
export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
