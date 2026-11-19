import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lists } from './lists';

/** Connection to OnePlay running on a computer on the same Wi-Fi. */
export type Conn = { host: string; token: string; name: string };
export type PcItem = { id: string; name: string; size: number; ext: string };
export type PcFolder = { id: string; name: string; items: PcItem[] };
export type RemoteResume = { pos: number; dur: number; at: number };

const KEY = 'oneplay.pc.v1';
let conn: Conn | null = null;

export async function loadConn(): Promise<Conn | null> {
  if (conn) return conn;
  try { const v = await AsyncStorage.getItem(KEY); conn = v ? (JSON.parse(v) as Conn) : null; } catch { conn = null; }
  return conn;
}
export const getConn = () => conn;
export async function clearConn() { conn = null; try { await AsyncStorage.removeItem(KEY); } catch { /* ignore */ } }

export function normalizeHost(input: string): string {
  const h = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  return /:\d+$/.test(h) ? h : `${h}:8765`;
}

async function call<T>(host: string, path: string, opts: { method?: string; body?: unknown; token?: string; timeout?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeout ?? 6000);
  try {
    const res = await fetch(`http://${host}${path}`, {
      method: opts.method ?? 'GET', signal: ctl.signal,
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Could not reach the computer. Check the address and that both are on the same Wi-Fi.');
    throw e;
  } finally { clearTimeout(timer); }
}

export async function pair(hostInput: string, code: string, timeout?: number): Promise<Conn> {
  const host = normalizeHost(hostInput);
  const r = await call<{ token: string; name: string }>(host, '/api/pair', { method: 'POST', body: { code: code.trim() }, timeout });
  conn = { host, token: r.token, name: r.name };
  await AsyncStorage.setItem(KEY, JSON.stringify(conn)).catch(() => {});
  return conn;
}
let lastFolders: PcFolder[] = [];
/** Finds one shared file by its id, refreshing the list once if it is not known yet. */
export async function findPcItem(id: string): Promise<{ item: PcItem; folder: PcFolder } | null> {
  const look = () => { for (const f of lastFolders) { const item = f.items.find((i) => i.id === id); if (item) return { item, folder: f }; } return null; };
  return look() ?? (await fetchLibrary(true).then(look).catch(() => null));
}
export async function fetchLibrary(refresh = false): Promise<PcFolder[]> {
  if (!conn) throw new Error('Not connected');
  try { lastFolders = (await call<{ folders: PcFolder[] }>(conn.host, `/api/library${refresh ? '?refresh=1' : ''}`, { token: conn.token, timeout: 30000 })).folders; return lastFolders; }
  catch (e) { if ((e as Error).message === 'Not paired') await clearConn(); throw e; }
}
export const fileUrl = (id: string) => (conn ? `http://${conn.host}/file/${id}?t=${conn.token}` : '');

const nameKey = (name: string) => name.toLowerCase();
/** Where this file was last stopped on any paired device, or null when sync is not available. */
export async function remoteResume(name: string): Promise<RemoteResume | null> {
  if (!conn) return null;
  try { return (await call<Record<string, RemoteResume>>(conn.host, '/api/sync', { token: conn.token, timeout: 2500 }))[nameKey(name)] ?? null; } catch { return null; }
}
export function pushResume(name: string, pos: number, dur: number) {
  if (!conn) return;
  const done = dur > 0 && (pos < 5 || pos > dur - 10);
  void call(conn.host, '/api/sync', { method: 'PUT', token: conn.token, timeout: 3000, body: { [nameKey(name)]: { pos: done ? 0 : pos, dur, at: Date.now() } } }).catch(() => {});
}

export type PcStatus = { title?: string; paused?: boolean; position?: number; duration?: number; volume?: number; muted?: boolean; speed?: number; index?: number; count?: number; online?: boolean };
export async function pcStatus(): Promise<PcStatus> {
  if (!conn) throw new Error('Not connected');
  return call<PcStatus>(conn.host, '/api/status', { token: conn.token, timeout: 2500 });
}
export async function pcControl(body: Record<string, unknown>): Promise<void> {
  if (!conn) throw new Error('Not connected');
  await call(conn.host, '/api/control', { method: 'POST', token: conn.token, body, timeout: 4000 });
}
export async function pullPcLists(): Promise<Lists | null> {
  if (!conn) return null;
  try { return await call<Lists>(conn.host, '/api/lists', { token: conn.token, timeout: 4000 }); } catch { return null; }
}
export async function pushPcLists(l: Partial<Lists>) {
  if (!conn) return;
  try { await call(conn.host, '/api/lists', { method: 'PUT', token: conn.token, body: l, timeout: 4000 }); } catch { /* computer offline; synced next time */ }
}

/** Reads the pairing QR shown by OnePlay on the computer: oneplay://pair?h=ip:port,ip:port&c=123456 */
export function parsePairQr(data: string): { hosts: string[]; code: string } | null {
  const m = /^oneplay:\/\/pair\?(.+)$/i.exec(data.trim());
  if (!m) return null;
  const q = new URLSearchParams(m[1]);
  const hosts = (q.get('h') ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const code = q.get('c') ?? '';
  return hosts.length && /^\d{6}$/.test(code) ? { hosts, code } : null;
}
/** Tries every address from the QR at the same time and keeps the first that answers. */
export async function pairFromQr(hosts: string[], code: string): Promise<Conn> {
  // Hermes may not have Promise.any, so wait for the first success by hand.
  return new Promise<Conn>((resolve, reject) => {
    const errors: Error[] = []; let left = hosts.length;
    for (const h of hosts) {
      pair(h, code, 4000).then(resolve, (e: Error) => {
        errors.push(e);
        if (--left === 0) reject(errors.find((x) => x.message === 'Wrong code' || /attempts/.test(x.message)) ?? new Error('Could not reach the computer. Make sure both are on the same Wi-Fi.'));
      });
    }
  });
}
