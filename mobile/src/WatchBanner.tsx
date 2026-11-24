import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from './theme';
import { link } from './link';
import { loadConn } from './remote';

/** Shows "Watch now" when the computer starts something, so the phone can join in with one tap. */
export function WatchBanner({ onWatch }: { onWatch: () => void }) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const seen = useRef('');
  useEffect(() => {
    let off = () => {}; let held = false; let dead = false;
    void loadConn().then((c) => {
      if (!c || dead) return;
      link.acquire(); held = true;
      off = link.onStatus((s) => {
        const key = s.online && s.title ? `${s.id ?? ''}|${s.title}` : '';
        if (!key) { seen.current = ''; setTitle(''); return; }
        if (key !== seen.current) { seen.current = key; setTitle(s.title ?? ''); }
      });
    });
    return () => { dead = true; off(); if (held) link.release(); };
  }, []);
  if (!title) return null;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 24, backgroundColor: t.panel, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 8, shadowOpacity: 0.25, shadowRadius: 8 }}>
      <Feather name="monitor" size={22} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text2, fontSize: 12 }}>Playing on your computer</Text>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>{title}</Text>
      </View>
      <Pressable onPress={() => { setTitle(''); onWatch(); }} style={{ backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}><Text style={{ color: '#fff', fontWeight: '600' }}>Watch now</Text></Pressable>
      <Pressable onPress={() => setTitle('')} hitSlop={10}><Feather name="x" size={18} color={t.text2} /></Pressable>
    </View>
  );
}
