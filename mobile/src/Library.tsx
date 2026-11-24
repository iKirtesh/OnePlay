import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { clock, useTheme } from './theme';
import { Folder, Item, Library as Lib, hasAccess, loadCached, requestAccess, scanLibrary, Access } from './scan';
import { Thumb } from './Thumb';
import { getJSON, getResume, loadResume, setJSON } from './storage';
import { remoteResumeAll } from './remote';
import { checkUpdate } from './update';
import { Lists, empty, isFav, livePlaylists, loadLists, newId, savePlaylist, setFav, syncLists } from './lists';

type Tab = 'folders' | 'videos' | 'music' | 'favorites';
type Sort = 'newest' | 'name' | 'longest';
const SORTS: Sort[] = ['newest', 'name', 'longest'];
export type Play = { queue: Item[]; index: number };

export function LibraryScreen({ onPlay, onPc, onLists }: { onPlay: (p: Play) => void; onPc?: () => void; onLists?: () => void }) {
  const t = useTheme();
  const [lib, setLib] = useState<Lib | null>(null);
  const [access, setAccess] = useState<Access | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('folders');
  const [folder, setFolder] = useState<Folder | null>(null);
  const [q, setQ] = useState('');
  const [, bump] = useState(0);
  const [lists, setLists] = useState<Lists>(empty());
  const [action, setAction] = useState<Item | null>(null);
  const [picking, setPicking] = useState(false);
  const [newName, setNewName] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [sort, setSort] = useState<Sort>('newest');
  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [streams, setStreams] = useState<string[]>([]);
  const [update, setUpdate] = useState<{ tag: string; url: string } | null>(null);
  useEffect(() => {
    void loadLists().then((l) => { setLists(l); void syncLists(l).then(setLists); });
    void getJSON<string[]>('oneplay.hidden', []).then(setHidden);
    void getJSON<Sort>('oneplay.sort', 'newest').then(setSort);
    void getJSON<string[]>('oneplay.streams', []).then(setStreams);
    void checkUpdate().then(setUpdate);
  }, []);
  const toggleFav = (item: Item) => { void setFav(lists, item.name, !isFav(lists, item.name)).then(setLists); };
  const addToPlaylist = (item: Item, id: string | null) => {
    const existing = id ? lists.playlists[id] : undefined;
    const p = existing ?? { id: newId(), name: newName.trim() || 'My playlist', items: [], at: 0 };
    if (!p.items.some((n) => n.toLowerCase() === item.name.toLowerCase())) void savePlaylist(lists, { ...p, items: [...p.items, item.name] }).then(setLists);
    setAction(null); setPicking(false); setNewName('');
  };
  const toggleHide = (id: string) => setHidden((h) => { const n = h.includes(id) ? h.filter((x) => x !== id) : [...h, id]; setJSON('oneplay.hidden', n); return n; });
  const nextSort = () => { const n = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length] ?? 'newest'; setSort(n); setJSON('oneplay.sort', n); };
  const playUrl = (u: string) => {
    const clean = u.trim();
    if (!/^https?:\/\//i.test(clean)) return;
    const n = [clean, ...streams.filter((x) => x !== clean)].slice(0, 8);
    setStreams(n); setJSON('oneplay.streams', n); setUrlOpen(false); setUrl('');
    onPlay({ queue: [{ id: 'u' + Date.now(), uri: clean, name: decodeURIComponent(clean.split('?')[0]!.split('/').pop() || clean), kind: /\.(mp3|m4a|aac|flac|ogg|wav)$/i.test(clean.split('?')[0]!) ? 'audio' : 'video', duration: 0, folderId: 'stream', added: Date.now() }], index: 0 });
  };
  const sortItems = (a: Item[]) => [...a].sort((x, y) => (sort === 'name' ? x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: 'base' }) : sort === 'longest' ? y.duration - x.duration : y.added - x.added));

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await loadResume();
      const cached = await loadCached();
      if (cached) { setLib(cached); setAccess('granted'); }
      if (!(await hasAccess())) { const a = await requestAccess(); setAccess(a); if (a !== 'granted') return; }
      setAccess('granted');
      const l = await scanLibrary((part) => setLib((cur) => (cur && cur.items.length > part.items.length ? cur : part)));
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
    const base = folder ? folder.items : tab === 'music' ? lib.items.filter((i) => i.kind === 'audio') : tab === 'favorites' ? lib.items.filter((i) => isFav(lists, i.name)) : lib.items.filter((i) => i.kind === 'video');
    return sortItems(needle ? base.filter((i) => i.name.toLowerCase().includes(needle)) : base);
  }, [lib, folder, tab, needle, lists, sort]);
  const folders = useMemo(() => (lib ? lib.folders.filter((f) => (showHidden || !hidden.includes(f.id)) && (!needle || f.name.toLowerCase().includes(needle))) : []), [lib, needle, hidden, showHidden]);
  const [pcResume, setPcResume] = useState<Record<string, { pos: number; dur: number; at: number }>>({});
  useEffect(() => { if (lib) void remoteResumeAll().then(setPcResume); }, [lib]);
  // Half-watched videos from this phone and from the computer, newest first.
  const recent = useMemo(() => {
    if (!lib) return [];
    const stamp = (i: Item) => Math.max(getResume(i.uri)?.at ?? 0, pcResume[i.name.toLowerCase()]?.pos ? pcResume[i.name.toLowerCase()]!.at : 0);
    return lib.items.filter((i) => getResume(i.uri) || (pcResume[i.name.toLowerCase()]?.pos ?? 0) > 5).sort((a, b) => stamp(b) - stamp(a)).slice(0, 12);
  }, [lib, busy, pcResume]);

  const row = (item: Item, queue: Item[]) => {
    const r = getResume(item.uri);
    return (
      <Pressable onPress={() => onPlay({ queue, index: queue.indexOf(item) })} onLongPress={() => setAction(item)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }}>
        <Thumb item={item} size={{ w: 96, h: 56 }} bg={t.fill} color={t.text2} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>{item.name}</Text>
          <Text style={{ color: t.text2, fontSize: 12, marginTop: 2 }}>{item.duration ? clock(item.duration) : item.kind}{r ? `  ·  resume ${clock(r.pos)}` : ''}</Text>
          {r && r.dur > 0 ? <View style={{ height: 3, borderRadius: 2, backgroundColor: t.track, marginTop: 5 }}><View style={{ height: 3, borderRadius: 2, width: `${Math.min(100, (r.pos / r.dur) * 100)}%`, backgroundColor: t.accent }} /></View> : null}
        </View>
        <Pressable onPress={() => toggleFav(item)} hitSlop={10}><Feather name="heart" size={18} color={isFav(lists, item.name) ? '#FF375F' : t.text2} /></Pressable>
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
    type Row = { t: 'f'; f: Folder } | { t: 'h'; title: string } | { t: 'i'; i: Item };
    const files = (lib?.items ?? []).filter((i) => !needle || i.name.toLowerCase().includes(needle));
    const rows: Row[] = [{ t: 'h', title: 'FOLDERS' }, ...folders.map((f) => ({ t: 'f' as const, f })), { t: 'h', title: 'ALL FILES' }, ...files.map((i) => ({ t: 'i' as const, i }))];
    body = (
      <FlatList data={rows} keyExtractor={(r, n) => (r.t === 'f' ? 'f' + r.f.id : r.t === 'i' ? 'i' + r.i.id : 'h' + n)} ListHeaderComponent={!needle && recent.length ? header : undefined} refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} tintColor={t.accent} />}
        initialNumToRender={14} windowSize={7}
        renderItem={({ item: r }) => r.t === 'h' ? <Text style={{ color: t.text2, fontSize: 13, fontWeight: '600', padding: 16, paddingBottom: 6 }}>{r.title}</Text> : r.t === 'i' ? row(r.i, files) : (
          <Pressable onPress={() => { setFolder(r.f); setQ(''); }} onLongPress={() => toggleHide(r.f.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Feather name="folder" size={22} color={t.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{r.f.name}</Text>
              <Text numberOfLines={1} style={{ color: t.text2, fontSize: 12, marginTop: 2 }}>{hidden.includes(r.f.id) ? 'Hidden · ' : ''}{r.f.items.length} {r.f.items.length === 1 ? 'file' : 'files'}{r.f.path ? `  ·  ${r.f.path.replace(/^\/storage\/emulated\/0/, 'Internal')}` : ''}</Text>
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
        <Pressable onPress={nextSort} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Feather name="sliders" size={18} color={t.accent} /><Text style={{ color: t.accent, fontSize: 12 }}>{sort}</Text></Pressable>
        {!folder && hidden.length ? <Pressable onPress={() => setShowHidden((v) => !v)} hitSlop={10}><Feather name={showHidden ? 'eye' : 'eye-off'} size={20} color={t.accent} /></Pressable> : null}
        {onLists ? <Pressable onPress={onLists} hitSlop={10}><Feather name="list" size={22} color={t.accent} /></Pressable> : null}
        {onPc ? <Pressable onPress={onPc} hitSlop={10}><Feather name="monitor" size={22} color={t.accent} /></Pressable> : null}
        <Pressable onPress={() => setUrlOpen(true)} hitSlop={10}><Feather name="link" size={22} color={t.accent} /></Pressable>
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
              {(['folders', 'videos', 'music', 'favorites'] as Tab[]).map((k) => (
                <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: tab === k ? t.panel : 'transparent' }}>
                  <Text style={{ color: t.text, fontSize: 13, fontWeight: tab === k ? '600' : '400', textTransform: 'capitalize' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      {update ? (
        <Pressable onPress={() => void Linking.openURL(update.url)} style={{ marginHorizontal: 16, marginBottom: 6, padding: 10, borderRadius: 10, backgroundColor: t.accent, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="download" size={16} color="#fff" /><Text style={{ color: '#fff', flex: 1 }}>New OnePlay {update.tag} is available. Tap to download.</Text>
        </Pressable>
      ) : null}
      {body}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => { setAction(null); setPicking(false); }}>
        <Pressable onPress={() => { setAction(null); setPicking(false); }} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: t.panel, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 8, paddingBottom: 24 }}>
            <Text numberOfLines={1} style={{ color: t.text2, textAlign: 'center', padding: 10, fontWeight: '600' }}>{action?.name}</Text>
            {!picking ? (
              <>
                <Pressable onPress={() => { if (action) toggleFav(action); setAction(null); }} style={{ padding: 14 }}><Text style={{ color: t.text, fontSize: 16 }}>{action && isFav(lists, action.name) ? 'Remove from favorites' : 'Add to favorites'}</Text></Pressable>
                <Pressable onPress={() => setPicking(true)} style={{ padding: 14 }}><Text style={{ color: t.text, fontSize: 16 }}>Add to playlist…</Text></Pressable>
              </>
            ) : (
              <>
                {livePlaylists(lists).map((p) => <Pressable key={p.id} onPress={() => action && addToPlaylist(action, p.id)} style={{ padding: 14 }}><Text style={{ color: t.text, fontSize: 16 }}>{p.name}</Text></Pressable>)}
                <View style={{ flexDirection: 'row', gap: 8, padding: 10 }}>
                  <TextInput value={newName} onChangeText={setNewName} placeholder="New playlist name" placeholderTextColor={t.text2} style={{ flex: 1, color: t.text, backgroundColor: t.fill, borderRadius: 10, padding: 10 }} />
                  <Pressable onPress={() => action && addToPlaylist(action, null)} style={{ backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '600' }}>Create</Text></Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      <Modal visible={urlOpen} transparent animationType="fade" onRequestClose={() => setUrlOpen(false)}>
        <Pressable onPress={() => setUrlOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 }}>
          <Pressable style={{ backgroundColor: t.panel, borderRadius: 16, padding: 16, gap: 10 }}>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>Play from network</Text>
            <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com/video.mp4 or .m3u8" placeholderTextColor={t.text2} style={{ color: t.text, backgroundColor: t.fill, borderRadius: 10, padding: 10 }} onSubmitEditing={() => playUrl(url)} />
            {streams.map((u) => <Pressable key={u} onPress={() => playUrl(u)}><Text numberOfLines={1} style={{ color: t.accent, fontSize: 13 }}>{u}</Text></Pressable>)}
            <Pressable onPress={() => playUrl(url)} style={{ backgroundColor: t.accent, borderRadius: 10, padding: 11, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '600' }}>Play</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
