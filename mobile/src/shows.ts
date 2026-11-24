import type { Item } from './scan';

export type Show = { name: string; seasons: { season: number; episodes: { ep: number; item: Item }[] }[]; count: number; cover: Item };

const EP = /^(.*?)[\s._-]+(?:S(\d{1,2})[\s._-]?E(\d{1,3})|(\d{1,2})x(\d{2,3}))(?![0-9])/i;
const clean = (s: string) => s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').replace(/[-\s]+$/, '').trim().replace(/\b\w/g, (c) => c.toUpperCase());

/** Groups files named like "Show.Name.S01E02" or "Show 1x02" into shows and seasons. Files that do not look like episodes are left out. */
export function groupShows(items: Item[]): Show[] {
  const by = new Map<string, Map<number, { ep: number; item: Item }[]>>();
  for (const item of items) {
    if (item.kind !== 'video') continue;
    const m = EP.exec(item.name);
    if (!m) continue;
    const name = clean(m[1] ?? '');
    if (name.length < 2) continue;
    const season = Number(m[2] ?? m[4]), ep = Number(m[3] ?? m[5]);
    const key = name.toLowerCase();
    const seasons = by.get(key) ?? new Map<number, { ep: number; item: Item }[]>();
    seasons.set(season, [...(seasons.get(season) ?? []), { ep, item }]);
    by.set(key, seasons);
  }
  const shows: Show[] = [];
  for (const seasons of by.values()) {
    const list = [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([season, eps]) => ({ season, episodes: eps.sort((a, b) => a.ep - b.ep) }));
    const first = list[0]!.episodes[0]!.item;
    const raw = EP.exec(first.name)?.[1] ?? first.name;
    shows.push({ name: clean(raw), seasons: list, count: list.reduce((n, s) => n + s.episodes.length, 0), cover: first });
  }
  return shows.sort((a, b) => a.name.localeCompare(b.name));
}
