import AsyncStorage from '@react-native-async-storage/async-storage';

export type Resume = { pos: number; dur: number; at: number };
const KEY = 'oneplay.resume.v1';
let cache: Record<string, Resume> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export async function loadResume(): Promise<Record<string, Resume>> {
  if (cache) return cache;
  try { const v = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}'); cache = v && typeof v === 'object' ? v : {}; } catch { cache = {}; }
  return cache!;
}
export function getResume(uri: string): Resume | undefined { return cache?.[uri]; }
/** Remembers where you stopped. A finished or barely started file is forgotten. */
export function saveResume(uri: string, pos: number, dur: number) {
  if (!cache) cache = {};
  if (dur > 0 && (pos < 5 || pos > dur - 10)) delete cache[uri];
  else cache[uri] = { pos, dur, at: Date.now() };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void AsyncStorage.setItem(KEY, JSON.stringify(cache)).catch(() => {}); }, 800);
}

/** Small helpers for favorites, hidden folders, sort choice and stream history. */
export async function getJSON<T>(key: string, fallback: T): Promise<T> {
  try { const v = await AsyncStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function setJSON(key: string, value: unknown) { void AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {}); }
