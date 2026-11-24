import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import BackgroundActions from 'react-native-background-actions';
import { link } from './link';
import { getLibrary } from './scan';

const KEY = 'oneplay.sharePhone';
let running = false;
let offs: Array<() => void> = [];
let tick: ReturnType<typeof setInterval> | null = null;
let sent: unknown = null;

export const isPhoneShareOn = async () => (await AsyncStorage.getItem(KEY).catch(() => null)) === '1';

function publish() {
  const lib = getLibrary();
  if (!lib) return;
  sent = lib;
  link.sendRaw({
    type: 'library', name: 'Phone',
    folders: lib.folders.map((f) => ({ id: f.id, name: f.name, items: f.items.map((i) => ({ id: i.id, name: i.name, kind: i.kind, duration: i.duration })) })),
  });
}

async function onMsg(m: any) {
  if (m?.type !== 'stat' && m?.type !== 'read') return;
  const item = getLibrary()?.items.find((i) => i.id === m.file);
  if (!item) { link.sendRaw({ type: 'reply', req: m.req, error: 'File not found' }); return; }
  try {
    if (m.type === 'stat') {
      const info = await FS.getInfoAsync(item.uri);
      link.sendRaw({ type: 'reply', req: m.req, size: info.exists ? (info as { size?: number }).size ?? 0 : 0 });
    } else {
      const data = await FS.readAsStringAsync(item.uri, { encoding: FS.EncodingType.Base64, position: Number(m.start), length: Number(m.length) });
      link.sendRaw({ type: 'reply', req: m.req, data });
    }
  } catch (e) { link.sendRaw({ type: 'reply', req: m.req, error: (e as Error).message }); }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Keeps the app alive with a notification so the computer can keep playing phone files when the screen is off. */
async function keepAlive() {
  try {
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never).catch(() => null);
    if (BackgroundActions.isRunning()) return;
    await BackgroundActions.start(async () => { while (BackgroundActions.isRunning()) await sleep(4000); }, {
      taskName: 'OnePlay sharing', taskTitle: 'OnePlay is sharing videos', taskDesc: 'Your computer can play videos from this phone.',
      taskIcon: { name: 'ic_launcher', type: 'mipmap' }, color: '#0A84FF', foregroundServiceType: ['dataSync'],
    } as never);
  } catch { /* sharing still works while the app is open */ }
}

function start() {
  if (running) return;
  running = true;
  void keepAlive();
  link.acquire();
  offs = [link.onMessage((m) => { void onMsg(m); }), link.onState((up) => { if (up) publish(); })];
  if (link.connected) publish();
  // The library may finish scanning after we connect, so resend whenever it changes.
  tick = setInterval(() => { if (link.connected && getLibrary() !== sent) publish(); }, 3000);
}
function stop() {
  if (!running) return;
  running = false;
  void BackgroundActions.stop().catch(() => {});
  link.sendRaw({ type: 'unshare' });
  offs.forEach((f) => f()); offs = [];
  if (tick) { clearInterval(tick); tick = null; }
  sent = null;
  link.release();
}
export async function setPhoneShare(on: boolean) {
  await AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
  if (on) start(); else stop();
}
/** Called once the app is open and paired: resumes sharing if it was left on. */
export async function resumePhoneShare() { if (await isPhoneShareOn()) start(); }
/** Re-send the list after a rescan. */
export const republishPhoneLibrary = () => { if (running) publish(); };
