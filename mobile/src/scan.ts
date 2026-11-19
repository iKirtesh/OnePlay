import * as MediaLibrary from 'expo-media-library/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Item = { id: string; uri: string; name: string; kind: 'video' | 'audio'; duration: number; folderId: string; added: number };
export type Folder = { id: string; name: string; path: string; items: Item[] };
export type Library = { items: Item[]; folders: Folder[] };
export type Access = 'granted' | 'denied' | 'blocked';

export async function requestAccess(): Promise<Access> {
  const r = await MediaLibrary.requestPermissionsAsync(false, ['video', 'audio']);
  return r.granted ? 'granted' : r.canAskAgain ? 'denied' : 'blocked';
}
export async function hasAccess(): Promise<boolean> {
  try { return (await MediaLibrary.getPermissionsAsync(false, ['video', 'audio'])).granted; } catch { return false; }
}

let current: Library | null = null;
/** The most recent scan, shared with other screens (playlists). */
export const getLibrary = () => current;

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');
const dirOf = (uri: string) => { try { const p = decodeURIComponent(uri.replace(/^file:\/\//, '')); return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; } catch { return ''; } };

/** Groups files by the folder they live in (taken from the file path, which is quick and exact). */
export function group(items: Item[]): Library {
  const byFolder = new Map<string, Folder>();
  for (const it of items) {
    let f = byFolder.get(it.folderId);
    if (!f) {
      f = { id: it.folderId, name: it.folderId.split('/').pop() || 'Other', path: it.folderId, items: [] };
      byFolder.set(it.folderId, f);
    }
    f.items.push(it);
  }
  const folders = [...byFolder.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { items, folders };
}

const CACHE = 'oneplay.library.v2';
export async function loadCached(): Promise<Library | null> {
  try { const v = await AsyncStorage.getItem(CACHE); if (!v) return null; current = group(JSON.parse(v) as Item[]); return current; } catch { return null; }
}

/** Reads every video and audio file in every folder. Big pages, no album lookup, and results are reported while it is still reading. */
export async function scanLibrary(onPartial?: (l: Library) => void): Promise<Library> {
  const items: Item[] = [];
  let after: string | undefined;
  for (let page = 0; page < 100; page++) {
    const res = await MediaLibrary.getAssetsAsync({ first: 1500, after, mediaType: ['video', 'audio'], sortBy: [['creationTime', false]] });
    for (const a of res.assets) {
      if (a.mediaType !== 'video' && a.mediaType !== 'audio') continue;
      items.push({ id: a.id, uri: a.uri, name: stripExt(a.filename), kind: a.mediaType, duration: a.duration || 0, folderId: dirOf(a.uri) || a.albumId || 'Other', added: a.creationTime || 0 });
    }
    if (!res.hasNextPage) break;
    if (onPartial) { current = group([...items]); onPartial(current); }
    after = res.endCursor;
  }
  void AsyncStorage.setItem(CACHE, JSON.stringify(items)).catch(() => {});
  current = group(items);
  return current;
}
