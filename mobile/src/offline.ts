import * as MediaLibrary from 'expo-media-library/legacy'
import * as FS from 'expo-file-system/legacy';
import { fileUrl } from './remote';

/** Copies a file from the computer into the phone's Movies/Music so it plays without Wi-Fi. Shows up in Library after a refresh. */
export async function downloadToPhone(id: string, name: string, ext: string, onProgress: (f: number) => void): Promise<void> {
  const base = name.replace(new RegExp(`\\.${ext}$`, 'i'), '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'video';
  const dest = `${FS.cacheDirectory}${base}.${ext}`;
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Allow access to photos and videos to save files.');
  const dl = FS.createDownloadResumable(fileUrl(id), dest, {}, (p) => { if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite); });
  const r = await dl.downloadAsync();
  if (!r || r.status !== 200) { await FS.deleteAsync(dest, { idempotent: true }); throw new Error('Download failed. Is the computer still sharing?'); }
  try {
    const asset = await MediaLibrary.createAssetAsync(dest);
    try { await MediaLibrary.createAlbumAsync('OnePlay', asset, false); } catch { /* album may already exist or be refused; the file is still saved */ }
  } finally { await FS.deleteAsync(dest, { idempotent: true }); }
}
