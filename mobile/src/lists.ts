import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConn, pullPcLists, pushPcLists } from './remote';

/** Favorites and playlists, matched across devices by file name and merged so the newest change wins. */
export type Playlist = { id: string; name: string; items: string[]; at: number; deleted?: boolean };
export type Lists = { fav: Record<string, { on: boolean; at: number }>; playlists: Record<string, Playlist> };

const KEY = 'oneplay.lists.v1';
export const keyOf = (name: string) => name.toLowerCase();
export const empty = (): Lists => ({ fav: {}, playlists: {} });

export function merge(a: Lists, b: Partial<Lists>): Lists {
  const out: Lists = { fav: { ...a.fav }, playlists: { ...a.playlists } };
  for (const [k, v] of Object.entries(b.fav ?? {})) if (v && (out.fav[k]?.at ?? 0) < v.at) out.fav[k] = { on: !!v.on, at: v.at };
  for (const [k, v] of Object.entries(b.playlists ?? {})) if (v && Array.isArray(v.items) && (out.playlists[k]?.at ?? 0) < v.at) out.playlists[k] = v;
  return out;
}
export async function loadLists(): Promise<Lists> {
  try { const v = await AsyncStorage.getItem(KEY); return v ? merge(empty(), JSON.parse(v)) : empty(); } catch { return empty(); }
}
export async function saveLists(l: Lists) { try { await AsyncStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } }

export const isFav = (l: Lists, name: string) => !!l.fav[keyOf(name)]?.on;
export const livePlaylists = (l: Lists) => Object.values(l.playlists).filter((p) => !p.deleted).sort((a, b) => b.at - a.at);
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Applies a change locally, saves it, and sends it to the computer when connected. */
export async function change(cur: Lists, patch: Partial<Lists>): Promise<Lists> {
  const next = merge(cur, patch);
  await saveLists(next);
  if (getConn()) void pushPcLists(patch);
  return next;
}
export const setFav = (cur: Lists, name: string, on: boolean) => change(cur, { fav: { [keyOf(name)]: { on, at: Date.now() } } });
export const savePlaylist = (cur: Lists, p: Playlist) => change(cur, { playlists: { [p.id]: { ...p, at: Date.now() } } });

/** Pulls the computer's lists, merges them in, and sends back anything only this phone has. */
export async function syncLists(cur: Lists): Promise<Lists> {
  if (!getConn()) return cur;
  const remote = await pullPcLists();
  if (!remote) return cur;
  const merged = merge(cur, remote);
  await saveLists(merged);
  void pushPcLists(merged);
  return merged;
}
