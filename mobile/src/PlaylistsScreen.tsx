import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, FlatList, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { getLibrary, Item } from './scan';
import { fetchLibrary, fileUrl, getConn, loadConn } from './remote';
import { Lists, Playlist, empty, keyOf, livePlaylists, loadLists, savePlaylist, syncLists } from './lists';
import type { Play } from './Library';

const shuffled = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; };

/** Playlists made on this phone or on the computer. Each name is matched to a file on this phone, or streamed from the computer. */
export function PlaylistsScreen({ onPlay, onClose }: { onPlay: (p: Play) => void; onClose: () => void }) {
  const t = useTheme();
  const [lists, setLists] = useState<Lists>(empty());
  const [open, setOpen] = useState<string | null>(null);
  const [pc, setPc] = useState<Map<string, Item>>(new Map());

  useEffect(() => {
    void loadLists().then((l) => { setLists(l); void syncLists(l).then(setLists); });
    void loadConn().then(async (c) => {
      if (!c) return;
      try {
        const m = new Map<string, Item>();
        for (const f of await fetchLibrary()) for (const i of f.items) m.set(keyOf(i.name), { id: i.id, uri: fileUrl(i.id), name: i.name, kind: /^(mp3|flac|wav|aac|ogg|opus|m4a)$/.test(i.ext) ? 'audio' : 'video', duration: 0, folderId: f.id, added: 0 });
        setPc(m);
      } catch { /* computer offline */ }
    });
  }, []);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (open) setOpen(null); else onClose(); return true; }); return () => s.remove(); }, [open, onClose]);

  const local = useMemo(() => { const m = new Map<string, Item>(); for (const i of getLibrary()?.items ?? []) m.set(keyOf(i.name), i); return m; }, []);
  const resolve = (name: string): Item | undefined => local.get(keyOf(name)) ?? pc.get(keyOf(name));
  const pl: Playlist | undefined = open ? lists.playlists[open] : undefined;
  const entries = (pl?.items ?? []).map((n) => ({ name: n, item: resolve(n) }));
  const playable = entries.map((e) => e.item).filter((i): i is Item => !!i);
  const del = () => { if (pl) { void savePlaylist(lists, { ...pl, deleted: true }).then(setLists); setOpen(null); } };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <Pressable onPress={() => (open ? setOpen(null) : onClose())} hitSlop={10}><Feather name="chevron-left" size={28} color={t.accent} /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 20, fontWeight: '700' }}>{pl ? pl.name : 'Playlists'}</Text>
        {pl ? <Pressable onPress={del} hitSlop={10}><Feather name="trash-2" size={20} color="#FF453A" /></Pressable> : null}
      </View>
      {pl ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 8 }}>
            {[{ label: 'Play', icon: 'play', run: () => onPlay({ queue: playable, index: 0 }) }, { label: 'Shuffle', icon: 'shuffle', run: () => onPlay({ queue: shuffled(playable), index: 0 }) }].map((b) => (
              <Pressable key={b.label} disabled={!playable.length} onPress={b.run} style={{ flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', padding: 11, borderRadius: 12, backgroundColor: t.accent, opacity: playable.length ? 1 : 0.4 }}>
                <Feather name={b.icon as 'play'} size={16} color="#fff" /><Text style={{ color: '#fff', fontWeight: '600' }}>{b.label}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList data={entries} keyExtractor={(e, i) => e.name + i}
            ListEmptyComponent={<Text style={{ color: t.text2, textAlign: 'center', marginTop: 50 }}>Empty. Long-press a video in your library to add it.</Text>}
            renderItem={({ item: e }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12, opacity: e.item ? 1 : 0.5 }}>
                <Pressable disabled={!e.item} onPress={() => e.item && onPlay({ queue: playable, index: playable.indexOf(e.item) })} style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ color: t.text, fontSize: 15 }}>{e.name}</Text>
                  <Text style={{ color: t.text2, fontSize: 12 }}>{e.item ? (local.has(keyOf(e.name)) ? 'On this phone' : 'From your computer') : getConn() ? 'Not found on this phone or your computer' : 'Not on this phone'}</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => pl && void savePlaylist(lists, { ...pl, items: pl.items.filter((n) => n !== e.name) }).then(setLists)}><Feather name="x" size={18} color={t.text2} /></Pressable>
              </View>
            )} />
        </>
      ) : (
        <FlatList data={livePlaylists(lists)} keyExtractor={(p) => p.id}
          ListEmptyComponent={<Text style={{ color: t.text2, textAlign: 'center', marginTop: 60, paddingHorizontal: 30 }}>No playlists yet. Long-press a video in your library and choose "Add to playlist". Playlists made in OnePlay on your computer show up here too.</Text>}
          renderItem={({ item: p }) => (
            <Pressable onPress={() => setOpen(p.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 14 }}>
              <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Feather name="list" size={20} color={t.accent} /></View>
              <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{p.name}</Text><Text style={{ color: t.text2, fontSize: 12 }}>{p.items.length} {p.items.length === 1 ? 'item' : 'items'}</Text></View>
              <Feather name="chevron-right" size={18} color={t.text2} />
            </Pressable>
          )} />
      )}
    </SafeAreaView>
  );
}
