import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { clock, useTheme } from './theme';
import { Folder, Item, Library as Lib, hasAccess, requestAccess, scanLibrary, Access } from './scan';
import { Thumb } from './Thumb';
import { getResume, loadResume } from './storage';

type Tab = 'folders' | 'videos' | 'music';
export type Play = { queue: Item[]; index: number };

export function LibraryScreen({ onPlay }: { onPlay: (p: Play) => void }) {
  const t = useTheme();
  const [lib, setLib] = useState<Lib | null>(null);
  const [access, setAccess] = useState<Access | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('folders');
  const [folder, setFolder] = useState<Folder | null>(null);
  const [q, setQ] = useState('');
  const [, bump] = useState(0);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await loadResume();
      if (!(await hasAccess())) { const a = await requestAccess(); setAccess(a); if (a !== 'granted') return; }
      setAccess('granted');
      const l = await scanLibrary();
      setLib(l);
      setFolder((f) => (f ? l.folders.find((x) => x.id === f.id) ?? null : null));
    } finally { setBusy(false); bump((n) => n + 1); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // Android back button inside a folder goes back to the folder list.
  useEffect(() => {
    if (!folder) return;
    const { BackHandler } = require('react-native');
    const s = BackHandler.addEventListener('hardwareBackPress', () => { setFolder(null); return true; });
    return () => s.remove();
  }, [folder]);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'audio/*'], multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    const queue: Item[] = r.assets.map((a, i) => ({ id: `p${i}`, uri: a.uri, name: a.name.replace(/\.[^.]+$/, ''), kind: (a.mimeType ?? '').startsWith('audio') ? 'audio' : 'video', duration: 0, folderId: 'picked', added: Date.now() }));
    onPlay({ queue, index: 0 });
  };

  const needle = q.trim().toLowerCase();
  const list: Item[] = useMemo(() => {
    if (!lib) return [];
    const base = folder ? folder.items : tab === 'music' ? lib.items.filter((i) => i.kind === 'audio') : lib.items.filter((i) => i.kind === 'video');
    return needle ? base.filter((i) => i.name.toLowerCase().includes(needle)) : base;
  }, [lib, folder, tab, needle]);
  const folders = useMemo(() => (lib ? lib.folders.filter((f) => !needle || f.name.toLowerCase().includes(needle)) : []), [lib, needle]);
  const recent = useMemo(() => (lib ? lib.items.filter((i) => getResume(i.uri)).sort((a, b) => (getResume(b.uri)!.at - getResume(a.uri)!.at)).slice(0, 12) : []), [lib, busy]);

  const row = (item: Item, queue: Item[]) => {
    const r = getResume(item.uri);
    return (
      <Pressable onPress={() => onPlay({ queue, index: queue.indexOf(item) })} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
        <Thumb item={item} size={{ w: 96, h: 56 }} bg={t.fill} color={t.text2} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>{item.name}</Text>
          <Text style={{ color: t.text2, fontSize: 12, marginTop: 2 }}>{item.duration ? clock(item.duration) : item.kind}{r ? `  ·  resume ${clock(r.pos)}` : ''}</Text>
          {r && r.dur > 0 ? <View style={{ height: 3, borderRadius: 2, backgroundColor: t.track, marginTop: 5 }}><View style={{ height: 3, borderRadius: 2, width: `${Math.min(100, (r.pos / r.dur) * 100)}%`, backgroundColor: t.accent }} /></View> : null}
        </View>
      </Pressable>
    );
  };

  const header = (
    <View>
      {!folder && recent.length > 0 && !needle && tab === 'folders' ? (
        <View style={{ paddingTop: 4 }}>
          <Text style={{ color: t.text2, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingBottom: 6 }}>CONTINUE WATCHING</Text>
          <FlatList horizontal data={recent} keyExtractor={(i) => i.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => (
              <Pressable onPress={() => onPlay({ queue: recent, index: recent.indexOf(item) })} style={{ width: 150 }}>
                <Thumb item={item} size={{ w: 150, h: 84 }} bg={t.fill} color={t.text2} radius={12} />
                <Text numberOfLines={1} style={{ color: t.text, fontSize: 13, marginTop: 6 }}>{item.name}</Text>
              </Pressable>
            )} />
          <Text style={{ color: t.text2, fontSize: 13, fontWeight: '600', padding: 16, paddingBottom: 6 }}>FOLDERS</Text>
        </View>
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (access === 'denied' || access === 'blocked') {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <Feather name="folder" size={44} color={t.text2} />
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>Allow access to your media</Text>
        <Text style={{ color: t.text2, textAlign: 'center' }}>OnePlay needs permission to find the videos and music on this device.</Text>
        <Pressable onPress={() => (access === 'blocked' ? void Linking.openSettings() : void refresh())} style={{ backgroundColor: t.accent, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>{access === 'blocked' ? 'Open Settings' : 'Allow'}</Text>
        </Pressable>
        <Pressable onPress={pick}><Text style={{ color: t.accent }}>Or open a single file…</Text></Pressable>
      </View>
    );
  } else if (!lib) {
    body = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}><ActivityIndicator color={t.accent} /><Text style={{ color: t.text2 }}>Scanning your folders…</Text></View>;
  } else if (!folder && tab === 'folders') {
    body = (
      <FlatList data={folders} keyExtractor={(f) => f.id} ListHeaderComponent={header} refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} tintColor={t.accent} />}
        ListEmptyComponent={<Text style={{ color: t.text2, textAlign: 'center', marginTop: 60 }}>No media found</Text>}
        renderItem={({ item: f }) => (
          <Pressable onPress={() => { setFolder(f); setQ(''); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Feather name="folder" size={22} color={t.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{f.name}</Text>
              <Text numberOfLines={1} style={{ color: t.text2, fontSize: 12, marginTop: 2 }}>{f.items.length} {f.items.length === 1 ? 'file' : 'files'}{f.path ? `  ·  ${f.path.replace(/^\/storage\/emulated\/0/, 'Internal')}` : ''}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={t.text2} />
          </Pressable>
        )} />
    );
  } else {
    body = (
      <FlatList data={list} keyExtractor={(i) => i.id} refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} tintColor={t.accent} />}
        ListEmptyComponent={<Text style={{ color: t.text2, textAlign: 'center', marginTop: 60 }}>Nothing here</Text>}
        renderItem={({ item }) => row(item, list)} initialNumToRender={14} windowSize={7} />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 10 }}>
        {folder ? <Pressable onPress={() => setFolder(null)} hitSlop={10}><Feather name="chevron-left" size={26} color={t.accent} /></Pressable> : null}
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: folder ? 20 : 30, fontWeight: '700' }}>{folder ? folder.name : 'OnePlay'}</Text>
        <Pressable onPress={pick} hitSlop={10}><Feather name="plus-circle" size={24} color={t.accent} /></Pressable>
      </View>
      {lib ? (
        <View style={{ paddingHorizontal: 16, gap: 8, paddingBottom: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.fill, borderRadius: 10, paddingHorizontal: 10, gap: 6 }}>
            <Feather name="search" size={16} color={t.text2} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={t.text2} style={{ flex: 1, color: t.text, paddingVertical: 8 }} />
          </View>
          {!folder ? (
            <View style={{ flexDirection: 'row', backgroundColor: t.fill, borderRadius: 10, padding: 2 }}>
              {(['folders', 'videos', 'music'] as Tab[]).map((k) => (
                <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: tab === k ? t.panel : 'transparent' }}>
                  <Text style={{ color: t.text, fontWeight: tab === k ? '600' : '400', textTransform: 'capitalize' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {body}
    </SafeAreaView>
  );
}
