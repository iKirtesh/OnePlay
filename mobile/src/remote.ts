import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function pair(hostInput: string, code: string): Promise<Conn> {
  const host = normalizeHost(hostInput);
  const r = await call<{ token: string; name: string }>(host, '/api/pair', { method: 'POST', body: { code: code.trim() } });
  conn = { host, token: r.token, name: r.name };
  await AsyncStorage.setItem(KEY, JSON.stringify(conn)).catch(() => {});
  return conn;
}
export async function fetchLibrary(refresh = false): Promise<PcFolder[]> {
  if (!conn) throw new Error('Not connected');
  try { return (await call<{ folders: PcFolder[] }>(conn.host, `/api/library${refresh ? '?refresh=1' : ''}`, { token: conn.token, timeout: 30000 })).folders; }
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
