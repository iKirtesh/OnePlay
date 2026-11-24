import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import type { Item } from './scan';
import Slider from '@react-native-community/slider';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Conn, PcFolder, PcStatus, clearConn, fetchLibrary, fileUrl, loadConn, pair, pairFromQr, parsePairQr, pcControl, pcStatus } from './remote';
import { clock } from './theme';
import { link } from './link';
import { isPhoneShareOn, setPhoneShare } from './phoneShare';
import { FollowScreen } from './FollowScreen';
import type { Play } from './Library';

const size = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1e6))} MB`);

export function PcScreen({ onPlay, onClose, autoFollow }: { onPlay: (p: Play) => void; onClose: () => void; autoFollow?: boolean }) {
  const t = useTheme();
  const [conn, setConn] = useState<Conn | null | undefined>(undefined);
  const [host, setHost] = useState('');
  const [code, setCode] = useState('');
  const [folders, setFolders] = useState<PcFolder[]>([]);
  const [open, setOpen] = useState<PcFolder | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [view, setView] = useState<'browse' | 'remote'>('browse');
  const [sharing, setSharing] = useState(false);
  useEffect(() => { void isPhoneShareOn().then(setSharing); }, []);
  const [note, setNote] = useState('');
  const [follow, setFollow] = useState(!!autoFollow);
  const [scanning, setScanning] = useState(false);
  const [perm, askPerm] = useCameraPermissions();
  const scanned = React.useRef(false);

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
  const startScan = async () => {
    setErr('');
    const p = perm?.granted ? perm : await askPerm();
    if (!p.granted) { setErr('Camera permission is needed to scan the QR code. You can still type the address below.'); return; }
    scanned.current = false; setScanning(true);
  };
  const onScan = async (data: string) => {
    if (scanned.current) return;
    const q = parsePairQr(data);
    if (!q) return;
    scanned.current = true; setScanning(false); setBusy(true); setErr('');
    try { const c = await pairFromQr(q.hosts, q.code); setConn(c); await load(true); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  const play = (f: PcFolder, index: number) => {
    const queue: Item[] = f.items.map((i) => ({ id: i.id, uri: fileUrl(i.id), name: i.name, kind: /^(mp3|flac|wav|aac|ogg|opus|m4a)$/.test(i.ext) ? 'audio' : 'video', duration: 0, folderId: f.id, added: 0 }));
    onPlay({ queue, index });
  };
  const input = { color: t.text, backgroundColor: t.fill, borderRadius: 10, padding: 12, fontSize: 16 } as const;

  if (follow) return <FollowScreen onClose={() => setFollow(false)} />;
  if (scanning) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={(r) => void onScan(r.data)} />
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: '#fff' }} />
          <Text style={{ color: '#fff', marginTop: 20, fontSize: 16, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 6 }}>Point at the QR code on your computer</Text>
        </View>
        <Pressable onPress={() => setScanning(false)} style={{ position: 'absolute', top: 50, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, padding: 10 }}><Feather name="x" size={24} color="#fff" /></Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <Pressable onPress={() => (open ? setOpen(null) : onClose())} hitSlop={10}><Feather name="chevron-left" size={28} color={t.accent} /></Pressable>
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 20, fontWeight: '700' }}>{open ? open.name : conn ? conn.name : 'My computer'}</Text>
        {conn && !open ? <Pressable onPress={() => void load(true)} hitSlop={10}><Feather name="refresh-cw" size={20} color={t.accent} /></Pressable> : null}
        {conn && !open ? <Pressable onPress={() => { void clearConn().then(() => { setConn(null); setFolders([]); }); }} hitSlop={10}><Feather name="log-out" size={20} color={t.accent} /></Pressable> : null}
      </View>
      {conn && !open ? (
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, backgroundColor: t.fill, borderRadius: 10, padding: 2 }}>
          {(['browse', 'remote'] as const).map((k) => (
            <Pressable key={k} onPress={() => setView(k)} style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: view === k ? t.panel : 'transparent' }}>
              <Text style={{ color: t.text, fontWeight: view === k ? '600' : '400' }}>{k === 'browse' ? 'Browse' : 'Remote'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {conn && !open ? (
        <Pressable onPress={() => { const v = !sharing; setSharing(v); void setPhoneShare(v); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8 }}>
          <Feather name={sharing ? 'check-square' : 'square'} size={20} color={t.accent} />
          <Text style={{ color: t.text, flex: 1 }}>Share this phone's videos with the computer{sharing ? ' (keep this app open)' : ''}</Text>
        </Pressable>
      ) : null}
      {note ? <Text style={{ color: t.accent, textAlign: 'center', paddingBottom: 6 }}>{note}</Text> : null}
      {conn === undefined ? <ActivityIndicator style={{ marginTop: 60 }} color={t.accent} /> : null}
      {conn === null ? (
        <View style={{ padding: 20, gap: 12 }}>
          <Text style={{ color: t.text2, lineHeight: 20 }}>On your computer open OnePlay, click the Wi-Fi button, turn sharing on and add your video folders. A QR code appears there. Both devices must be on the same Wi-Fi.</Text>
          <Pressable disabled={busy} onPress={startScan} style={{ flexDirection: 'row', gap: 10, backgroundColor: t.accent, borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Feather name="camera" size={22} color="#fff" />}<Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>{busy ? 'Connecting…' : 'Scan QR code'}</Text>
          </Pressable>
          <Text style={{ color: t.text2, textAlign: 'center', marginTop: 6 }}>Or enter it by hand</Text>
          <TextInput value={host} onChangeText={setHost} placeholder="Address, e.g. 192.168.1.20:8765" placeholderTextColor={t.text2} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={input} />
          <TextInput value={code} onChangeText={setCode} placeholder="6-digit pairing code" placeholderTextColor={t.text2} keyboardType="number-pad" maxLength={6} style={input} />
          <Pressable disabled={busy || !host || code.length < 6} onPress={connect} style={{ backgroundColor: t.accent, opacity: busy || !host || code.length < 6 ? 0.5 : 1, borderRadius: 12, padding: 14, alignItems: 'center' }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Connect</Text>}
          </Pressable>
          {err ? <Text style={{ color: '#FF453A' }}>{err}</Text> : null}
        </View>
      ) : conn && view === 'remote' && !open ? (
        <RemotePad onFollow={() => setFollow(true)} />
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
                  <Pressable hitSlop={10} onPress={() => { void pcControl({ cmd: 'playId', id: item.id }).then(() => { setNote('Playing on your computer'); setTimeout(() => setNote(''), 2500); }).catch((e: Error) => setErr(e.message)); }}><Feather name="monitor" size={20} color={t.accent} /></Pressable>
                </Pressable>
              )} />
          )}
        </>
      ) : null}
    </SafeAreaView>
  );
}

/** Play, pause, seek and volume for the video that is playing on the computer. */
function RemotePad({ onFollow }: { onFollow: () => void }) {
  const t = useTheme();
  const [st, setSt] = useState<PcStatus | null>(null);
  const [err, setErr] = useState('');
  const [scrub, setScrub] = useState<number | null>(null);
  const [vol, setVol] = useState<number | null>(null);
  const poll = useCallback(async () => { try { setSt(await pcStatus()); setErr(''); } catch (e) { setErr((e as Error).message); } }, []);
  // The live connection delivers changes instantly; plain polling is only a slow safety net.
  useEffect(() => {
    link.acquire();
    const off = link.onStatus((s) => { setSt(s); setErr(''); });
    void poll(); const id = setInterval(() => { if (!link.connected) void poll(); }, 3000);
    return () => { off(); clearInterval(id); link.release(); };
  }, [poll]);
  const send = (body: Record<string, unknown>) => { if (link.send(body)) return; void pcControl(body).then(() => setTimeout(poll, 250)).catch((e: Error) => setErr(e.message)); };
  const on = !!st?.online && !!st.title;
  const dur = st?.duration ?? 0;
  const circle = (icon: React.ComponentProps<typeof Feather>['name'], onPress: () => void, big = false) => (
    <Pressable onPress={onPress} disabled={!on} style={{ width: big ? 72 : 52, height: big ? 72 : 52, borderRadius: 36, backgroundColor: big ? t.accent : t.fill, alignItems: 'center', justifyContent: 'center', opacity: on ? 1 : 0.4 }}>
      <Feather name={icon} size={big ? 30 : 22} color={big ? '#fff' : t.text} />
    </Pressable>
  );
  return (
    <View style={{ padding: 20, gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Feather name="monitor" size={40} color={on ? t.accent : t.text2} />
        <Text numberOfLines={2} style={{ color: t.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>{on ? st!.title : 'Nothing playing on your computer'}</Text>
        {!on ? <Text style={{ color: t.text2, textAlign: 'center' }}>Start a video in OnePlay on the computer, or pick one in Browse and tap the monitor icon.</Text> : null}
        {err ? <Text style={{ color: '#FF453A', textAlign: 'center' }}>{err}</Text> : null}
      </View>
      <Pressable onPress={onFollow} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, backgroundColor: t.fill }}>
        <Feather name="users" size={20} color={t.accent} /><Text style={{ color: t.accent, fontWeight: '700', fontSize: 16 }}>Watch together on this phone</Text>
      </Pressable>
      <View>
        <Slider disabled={!on} minimumValue={0} maximumValue={Math.max(dur, 1)} value={scrub ?? st?.position ?? 0} minimumTrackTintColor={t.accent} maximumTrackTintColor={t.track} thumbTintColor={t.accent}
          onValueChange={setScrub} onSlidingComplete={(v) => { setScrub(null); send({ cmd: 'seekTo', to: v }); }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}><Text style={{ color: t.text2, fontSize: 12 }}>{clock(scrub ?? st?.position ?? 0)}</Text><Text style={{ color: t.text2, fontSize: 12 }}>{clock(dur)}</Text></View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        {circle('skip-back', () => send({ cmd: 'prev' }))}
        {circle('rotate-ccw', () => send({ cmd: 'seekBy', by: -10 }))}
        {circle(st?.paused ? 'play' : 'pause', () => send({ cmd: 'toggle' }), true)}
        {circle('rotate-cw', () => send({ cmd: 'seekBy', by: 10 }))}
        {circle('skip-forward', () => send({ cmd: 'next' }))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable disabled={!on} onPress={() => send({ cmd: 'mute' })} hitSlop={8}><Feather name={st?.muted || (st?.volume ?? 1) === 0 ? 'volume-x' : 'volume-2'} size={22} color={on ? t.text : t.text2} /></Pressable>
        <Slider style={{ flex: 1 }} disabled={!on} minimumValue={0} maximumValue={100} value={vol ?? st?.volume ?? 0} minimumTrackTintColor={t.accent} maximumTrackTintColor={t.track} thumbTintColor={t.accent}
          onValueChange={setVol} onSlidingComplete={(v) => { setVol(null); send({ cmd: 'volume', value: Math.round(v) }); }} />
        <Pressable disabled={!on} onPress={() => { const sp = [0.5, 0.75, 1, 1.25, 1.5, 2]; send({ cmd: 'speed', value: sp[(sp.indexOf(st?.speed ?? 1) + 1) % sp.length] ?? 1 }); }} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: t.fill }}><Text style={{ color: t.text, fontWeight: '600' }}>{st?.speed ?? 1}x</Text></Pressable>
      </View>
    </View>
  );
}
