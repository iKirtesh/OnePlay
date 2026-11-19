import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import type { Item } from './scan';
import { Conn, PcFolder, clearConn, fetchLibrary, fileUrl, loadConn, pair } from './remote';
import type { Play } from './Library';

const size = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

export function PcScreen({ onPlay, onClose }: { onPlay: (p: Play) => void; onClose: () => void }) {
  const t = useTheme();
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [host, setHost] = useState('');
  const [code, setCode] = useState('');
  const [folders, setFolders] = useState<PcFolder[]>([]);
  const [open, setOpen] = useState<PcFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async (refresh = false) => {
    setBusy(true); setErr('');
    try { setFolders(await fetchLibrary(refresh)); }
    catch (e) { setErr((e as Error).message); if ((e as Error).message === 'Not paired') setConn(null); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void loadConn().then((c) => { setConn(c); if (c) void load(); }); }, [load]);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (open) setOpen(null); else onClose(); return true; }); return () => s.remove(); }, [open, onClose]);

  const connect = async () => {
    setBusy(true); setErr('');
    try { const c = await pair(host, code); setConn(c); setCode(''); await load(true); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const play = (f: PcFolder, index: number) => {
    const queue: Item[] = f.items.map((i) => ({ id: i.id, uri: fileUrl(i.id), name: i.name, kind: /^(mp3|flac|wav|aac|ogg|opus|m4a)$/.test(i.ext) ? 'audio' : 'video', duration: 0, folderId: f.id, added: 0 }));
    onPlay({ queue, index });
  };
  const input = { color: t.text, backgroundColor: t.fill, borderRadius: 10, padding: 12, fontSize: 16 } as const;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <Pressable onPress={() => (open ? setOpen(null) : onClose())} hitSlop={10}><Feather name="chevron-left" size={28} color={t.accent} /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 20, fontWeight: '700' }}>{open ? open.name : conn ? conn.name : 'My computer'}</Text>
        {conn && !open ? <Pressable onPress={() => void load(true)} hitSlop={10}><Feather name="refresh-cw" size={20} color={t.accent} /></Pressable> : null}
        {conn && !open ? <Pressable onPress={() => { void clearConn().then(() => { setConn(null); setFolders([]); }); }} hitSlop={10}><Feather name="log-out" size={20} color={t.accent} /></Pressable> : null}
      </View>
      {conn === undefined ? <ActivityIndicator style={{ marginTop: 60 }} color={t.accent} /> : null}
      {conn === null ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={{ color: t.text2, lineHeight: 20 }}>On your computer open OnePlay, click the Wi-Fi button, turn sharing on and add your video folders. Then enter the address and pairing code shown there. Both devices must be on the same Wi-Fi.</Text>
          <TextInput value={host} onChangeText={setHost} placeholder="Address, e.g. 192.168.1.20:8765" placeholderTextColor={t.text2} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
          <TextInput value={code} onChangeText={setCode} placeholder="6-digit pairing code" placeholderTextColor={t.text2} keyboardType="number-pad" maxLength={6} style={input} />
          <Pressable disabled={busy || !host || code.length < 6} onPress={connect} style={{ backgroundColor: t.accent, opacity: busy || !host || code.length < 6 ? 0.5 : 1, borderRadius: 12, padding: 14, alignItems: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Connect</Text>}
          </Pressable>
          {err ? <Text style={{ color: '#FF453A' }}>{err}</Text> : null}
        </View>
      ) : conn ? (
        <>
          {err ? <Text style={{ color: '#FF453A', paddingHorizontal: 16, paddingBottom: 8 }}>{err}</Text> : null}
          {busy && folders.length === 0 ? <ActivityIndicator style={{ marginTop: 40 }} color={t.accent} /> : null}
          {!open ? (
            <FlatList data={folders} keyExtractor={(f) => f.id}
              ListEmptyComponent={!busy ? <Text style={{ color: t.text2, textAlign: 'center', marginTop: 60, paddingHorizontal: 30 }}>No shared videos yet. Add folders in OnePlay on your computer.</Text> : undefined}
              renderItem={({ item: f }) => (
                <Pressable onPress={() => setOpen(f)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Feather name="folder" size={22} color={t.accent} /></View>
                  <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: t.text, fontSize: 16, fontWeight: '500' }}>{f.name}</Text><Text style={{ color: t.text2, fontSize: 12 }}>{f.items.length} {f.items.length === 1 ? 'file' : 'files'}</Text></View>
                  <Feather name="chevron-right" size={18} color={t.text2} />
                </Pressable>
              )} />
          ) : (
            <FlatList data={open.items} keyExtractor={(i) => i.id} initialNumToRender={20}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => play(open, index)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 14 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: t.fill, alignItems: 'center', justifyContent: 'center' }}><Feather name={/^(mp3|flac|wav|aac|ogg|opus|m4a)$/.test(item.ext) ? 'music' : 'film'} size={20} color={t.text2} /></View>
                  <View style={{ flex: 1 }}><Text numberOfLines={2} style={{ color: t.text, fontSize: 15, fontWeight: '500' }}>{item.name}</Text><Text style={{ color: t.text2, fontSize: 12 }}>{item.ext.toUpperCase()}  ·  {size(item.size)}</Text></View>
                </Pressable>
              )} />
          )}
        </>
      ) : null}
    </SafeAreaView>
  );
}
