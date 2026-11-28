import * as MediaLibrary from 'expo-media-library/legacy'
import * as FS from 'expo-file-system/legacy';
import { fileUrl } from './remote';

/** Saves any link into the phone's Movies/OnePlay so it plays without a connection. Shows up in Library after a refresh. */
export async function downloadUrlToPhone(url: string, name: string, ext: string, onProgress: (f: number) => void): Promise<void> {
  const base = name.replace(new RegExp(`\\.${ext}$`, 'i'), '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'video';
  const dest = `${FS.cacheDirectory}${base}.${ext}`;
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Allow access to photos and videos to save files.');
  const dl = FS.createDownloadResumable(url, dest, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36' } }, (p) => { if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite); });
  const r = await dl.downloadAsync();
  if (!r || r.status !== 200) { await FS.deleteAsync(dest, { idempotent: true }); throw new Error('Download failed. Is the source still reachable?'); }
  try {
    const asset = await MediaLibrary.createAssetAsync(dest);
    try { await MediaLibrary.createAlbumAsync('OnePlay', asset, false); } catch { /* album may already exist or be refused; the file is still saved */ }
  } finally { await FS.deleteAsync(dest, { idempotent: true }); }
}
export const downloadToPhone = (id: string, name: string, ext: string, onProgress: (f: number) => void) => downloadUrlToPhone(fileUrl(id), name, ext, onProgress);
