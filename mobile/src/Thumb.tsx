import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as VideoThumbnails from 'expo-video-thumbnails';
import type { Item } from './scan';

const cache = new Map<string, string | null>();
const waiting: (() => void)[] = [];
let running = 0;
// Only a few thumbnails are generated at a time so a big library does not freeze the phone.
const slot = () => new Promise<void>((res) => { const go = () => { running++; res(); }; if (running < 3) go(); else waiting.push(go); });
const release = () => { running--; waiting.shift()?.(); };

export function Thumb({ item, size, radius = 10, bg, color }: { item: Item; size: { w: number; h: number }; radius?: number; bg: string; color: string }) {
  const [uri, setUri] = useState<string | null>(cache.get(item.uri) ?? null);
  useEffect(() => {
    if (item.kind !== 'video' || cache.has(item.uri)) { setUri(cache.get(item.uri) ?? null); return; }
    let alive = true;
    void (async () => {
      await slot();
      try {
        const t = await VideoThumbnails.getThumbnailAsync(item.uri, { time: Math.min(2000, Math.max(0, item.duration * 100)), quality: 0.4 });
        cache.set(item.uri, t.uri);
        if (alive) setUri(t.uri);
      } catch { cache.set(item.uri, null); } finally { release(); }
    })();
    return () => { alive = false; };
  }, [item.uri, item.kind, item.duration]);
  return (
    <View style={{ width: size.w, height: size.h, borderRadius: radius, backgroundColor: bg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : <Feather name={item.kind === 'audio' ? 'music' : 'film'} size={size.h * 0.38} color={color} />}
    </View>
  );
}
