const BUILD = Number(process.env.EXPO_PUBLIC_BUILD ?? 0);

/** Asks GitHub for the newest mobile build and returns it only when it is newer than this one. */
export async function checkUpdate(): Promise<{ tag: string; url: string } | null> {
  if (!BUILD) return null;
  try {
    const r = await fetch('https://api.github.com/repos/iKirtesh/OnePlay/releases?per_page=15');
    if (!r.ok) return null;
    const list = (await r.json()) as { tag_name: string; html_url: string }[];
    let best = 0, url = '';
    for (const x of list) { const n = Number(/^mobile-(\d+)$/.exec(x.tag_name)?.[1] ?? 0); if (n > best) { best = n; url = x.html_url; } }
    return best > BUILD ? { tag: `build ${best}`, url } : null;
  } catch { return null; }
}
