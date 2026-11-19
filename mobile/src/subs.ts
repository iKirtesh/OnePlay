import * as FS from 'expo-file-system/legacy';

export type Cue = { s: number; e: number; text: string };

const ts = (v: string) => {
  const m = v.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?/);
  if (!m) return NaN;
  return (+(m[1] ?? 0)) * 3600 + +m[2]! * 60 + +m[3]! + (m[4] ? +('0.' + m[4]) : 0);
};

/** Parses SRT and WebVTT text into timed cues. */
export function parseSubs(raw: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = raw.replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, c] = lines[i]!.split('-->');
    const s = ts(a ?? ''), e = ts((c ?? '').trim().split(/\s+/)[0] ?? '');
    const text = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (Number.isFinite(s) && Number.isFinite(e) && text) cues.push({ s, e, text });
  }
  return cues.sort((x, y) => x.s - y.s);
}

export async function readSubs(uri: string): Promise<Cue[]> {
  return parseSubs(await FS.readAsStringAsync(uri));
}

/** Looks for a subtitle file with the same name next to the video. Returns null when the system will not let us read it. */
export async function findSibling(videoUri: string): Promise<Cue[] | null> {
  if (!videoUri.startsWith('file://')) return null;
  const base = videoUri.replace(/\.[^./]+$/, '');
  for (const ext of ['.srt', '.vtt', '.en.srt', '.eng.srt']) {
    try { const cues = await readSubs(base + ext); if (cues.length) return cues; } catch { /* not there or not readable */ }
  }
  return null;
}

/** Finds the cue to show at time t (binary search). */
export function cueAt(cues: Cue[], t: number): Cue | undefined {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, c = cues[mid]!;
    if (t < c.s) hi = mid - 1; else if (t > c.e) lo = mid + 1; else return c;
  }
  return undefined;
}
