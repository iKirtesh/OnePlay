import * as MediaLibrary from 'expo-media-library/legacy';

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

const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');
const dirOf = (uri: string) => { try { const p = decodeURIComponent(uri.replace(/^file:\/\//, '')); return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''; } catch { return ''; } };

/** Reads every video and audio file the system media index knows about, in every folder, and groups them by folder. */
export async function scanLibrary(): Promise<Library> {
  const albums = new Map<string, string>();
  try { for (const a of await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false })) albums.set(a.id, a.title); } catch { /* folder names fall back to the path */ }
  const items: Item[] = [];
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    const res = await MediaLibrary.getAssetsAsync({ first: 500, after, mediaType: ['video', 'audio'], sortBy: [['creationTime', false]] });
    for (const a of res.assets) {
      if (a.mediaType !== 'video' && a.mediaType !== 'audio') continue;
      items.push({ id: a.id, uri: a.uri, name: stripExt(a.filename), kind: a.mediaType, duration: a.duration || 0, folderId: a.albumId ?? dirOf(a.uri) ?? 'other', added: a.creationTime || 0 });
    }
    if (!res.hasNextPage) break;
    after = res.endCursor;
  }
  const byFolder = new Map<string, Folder>();
  for (const it of items) {
    let f = byFolder.get(it.folderId);
    if (!f) {
      const path = dirOf(it.uri);
      f = { id: it.folderId, name: albums.get(it.folderId) || path.split('/').pop() || 'Other', path, items: [] };
      byFolder.set(it.folderId, f);
    }
    f.items.push(it);
  }
  const folders = [...byFolder.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { items, folders };
}
