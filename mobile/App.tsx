import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer } from 'expo-video';

type Media = { uri: string; name: string };
type Tab = 'queue' | 'recent';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const RECENT_KEY = 'oneplay.recent';

const light = { bg: '#F5F5F7', panel: '#FFFFFF', text: '#1D1D1F', text2: '#6E6E73', sep: 'rgba(0,0,0,0.09)', fill: 'rgba(0,0,0,0.06)', accent: '#007AFF', track: 'rgba(0,0,0,0.14)' };
const dark = { bg: '#000000', panel: '#1C1C1E', text: '#F5F5F7', text2: '#A1A1A6', sep: 'rgba(255,255,255,0.1)', fill: 'rgba(255,255,255,0.09)', accent: '#0A84FF', track: 'rgba(255,255,255,0.2)' };

const clock = (n: number) => {
  if (!Number.isFinite(n) || n < 0) return '0:00';
  const s = Math.floor(n), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

export default function Root() { return <SafeAreaProvider><Player /></SafeAreaProvider>; }

function Player() {
  const c = useColorScheme() === 'dark' ? dark : light;
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [queue, setQueue] = useState<Media[]>([]);
  const [index, setIndex] = useState(-1);
  const [recent, setRecent] = useState<Media[]>([]);
  const [tab, setTab] = useState<Tab>('queue');
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');
  const viewRef = useRef<VideoView>(null);
  const player = useVideoPlayer(null, (p) => { p.timeUpdateEventInterval = 0.25; p.showNowPlayingNotification = true; });
  const live = useRef({ queue, index, loop });
  live.current = { queue, index, loop };
  const current = index >= 0 ? queue[index] : undefined;

  useEffect(() => { AsyncStorage.getItem(RECENT_KEY).then((v) => { try { const a = JSON.parse(v ?? '[]'); if (Array.isArray(a)) setRecent(a.filter((m) => m?.uri && m?.name).slice(0, 12)); } catch { /* ignore corrupt storage */ } }).catch(() => {}); }, []);

  const playAt = useCallback(async (list: Media[], i: number) => {
    const item = list[i];
    if (!item) return;
    setQueue(list); setIndex(i); setError(''); setPosition(0); setDuration(0);
    try {
      await player.replaceAsync({ uri: item.uri, metadata: { title: item.name } });
      player.loop = live.current.loop;
      player.play();
      setRecent((prev) => {
        const next = [item, ...prev.filter((m) => m.uri !== item.uri)].slice(0, 12);
        void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } catch (e) {
      setError(`Could not play "${item.name}". ${e instanceof Error ? e.message : ''} If it came from Recent, pick the file again.`);
    }
  }, [player]);

  useEffect(() => {
    const subs = [
      player.addListener('playingChange', (e) => setPlaying(e.isPlaying)),
      player.addListener('timeUpdate', (e) => setPosition(e.currentTime)),
      player.addListener('sourceLoad', (e) => setDuration(e.duration)),
      player.addListener('statusChange', (e) => { if (e.status === 'error') setError(`Playback error: ${e.error?.message ?? 'this format may not be supported on this device.'}`); }),
      player.addListener('playToEnd', () => {
        const { queue: q, index: i, loop: l } = live.current;
        if (!l && i >= 0 && i < q.length - 1) void playAt(q, i + 1);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, playAt]);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['video/*', 'audio/*'], multiple: true, copyToCacheDirectory: Platform.OS === 'ios' });
    if (res.canceled || !res.assets.length) return;
    void playAt(res.assets.map((a) => ({ uri: a.uri, name: a.name.replace(/\.[^.]+$/, '') })), 0);
  };
  const step = (d: 1 | -1) => { const { queue: q, index: i } = live.current; if (q.length > 1) void playAt(q, (i + d + q.length) % q.length); };
  const toggle = () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); if (!current) return void pick(); if (player.playing) player.pause(); else player.play(); };
  const cycleSpeed = () => { const n = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1; setSpeed(n); player.playbackRate = n; };
  const toggleLoop = () => { const v = !loop; setLoop(v); player.loop = v; };
  const toggleMute = () => { const v = !muted; setMuted(v); player.muted = v; };
  const pip = () => viewRef.current?.startPictureInPicture().catch(() => Alert.alert('Picture in picture', 'Not available on this device or for this file.'));

  const list = tab === 'queue' ? queue : recent;
  const s = styles(c);
  const IconBtn = ({ name, onPress, active, disabled, label }: { name: React.ComponentProps<typeof Feather>['name']; onPress: () => void; active?: boolean; disabled?: boolean; label: string }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.iconBtn, active && { backgroundColor: c.fill }, pressed && { opacity: 0.5 }, disabled && { opacity: 0.3 }]}>
      <Feather name={name} size={21} color={active ? c.accent : c.text2} />
    </Pressable>
  );

  const video = (
    <View style={[s.stage, landscape ? { flex: 1.3 } : { aspectRatio: 16 / 9 }]}>
      <VideoView ref={viewRef} player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} allowsPictureInPicture startsPictureInPictureAutomatically />
      {!current && (
        <View style={s.empty}>
          <View style={s.logo}><Feather name="play" size={30} color="#fff" /></View>
          <Text style={s.emptyTitle}>Play anything</Text>
          <Text style={s.emptySub}>Open a video or audio file from your phone.</Text>
        </View>
      )}
    </View>
  );

  const controls = (
    <View style={s.card}>
      <Text numberOfLines={1} style={s.title}>{current ? current.name : 'Not playing'}</Text>
      <View style={s.timeRow}>
        <Text style={s.time}>{clock(position)}</Text>
        <Slider style={{ flex: 1, height: 36 }} minimumValue={0} maximumValue={Math.max(duration, 1)} value={scrubbing ? undefined : Math.min(position, duration || 0)}
          minimumTrackTintColor={c.text} maximumTrackTintColor={c.track} thumbTintColor={c.text} disabled={!current}
          onSlidingStart={() => setScrubbing(true)} onSlidingComplete={(v) => { player.currentTime = v; setScrubbing(false); }} accessibilityLabel="Seek" />
        <Text style={[s.time, { textAlign: 'right' }]}>-{clock(Math.max(0, duration - position))}</Text>
      </View>
      <View style={s.row}>
        <IconBtn name="skip-back" label="Previous" disabled={queue.length < 2} onPress={() => step(-1)} />
        <IconBtn name="rotate-ccw" label="Back 10 seconds" disabled={!current} onPress={() => player.seekBy(-10)} />
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} onPress={toggle} style={({ pressed }) => [s.play, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Feather name={playing ? 'pause' : 'play'} size={26} color={c.bg} style={playing ? undefined : { marginLeft: 3 }} />
        </Pressable>
        <IconBtn name="rotate-cw" label="Forward 10 seconds" disabled={!current} onPress={() => player.seekBy(10)} />
        <IconBtn name="skip-forward" label="Next" disabled={queue.length < 2} onPress={() => step(1)} />
      </View>
      <View style={[s.row, { marginTop: 10, justifyContent: 'space-between' }]}>
        <Pressable accessibilityLabel="Playback speed" onPress={cycleSpeed} style={s.chip}><Text style={s.chipText}>{speed}×</Text></Pressable>
        <IconBtn name="repeat" label="Repeat" active={loop} onPress={toggleLoop} />
        <IconBtn name={muted ? 'volume-x' : 'volume-2'} label={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} />
        <Pressable accessibilityLabel="Picture in picture" onPress={pip} disabled={!current} style={[s.iconBtn, !current && { opacity: 0.3 }]}><MaterialCommunityIcons name="picture-in-picture-bottom-right" size={22} color={c.text2} /></Pressable>
        <IconBtn name="maximize" label="Fullscreen" disabled={!current} onPress={() => void viewRef.current?.enterFullscreen()} />
      </View>
      {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
    </View>
  );

  const library = (
    <View style={s.library}>
      <View style={s.libHead}>
        <View style={s.segment}>
          {(['queue', 'recent'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[s.segBtn, tab === t && { backgroundColor: c.panel }]} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
              <Text style={[s.segText, tab === t && { color: c.text }]}>{t === 'queue' ? 'Queue' : 'Recent'}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={pick} style={s.open} accessibilityRole="button"><Feather name="folder" size={15} color="#fff" /><Text style={s.openText}>Open</Text></Pressable>
      </View>
      <FlatList data={list} keyExtractor={(m, i) => `${m.uri}-${i}`} keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={s.emptyList}>{tab === 'queue' ? 'Tap Open to add videos or music.' : 'Files you play will show up here.'}</Text>}
        renderItem={({ item, index: i }) => {
          const on = current?.uri === item.uri;
          return (
            <Pressable onPress={() => (tab === 'queue' ? playAt(queue, i) : playAt([item, ...recent.filter((r) => r.uri !== item.uri)], 0))} style={[s.item, on && { backgroundColor: c.accent }]}>
              <Feather name={on && playing ? 'volume-2' : 'play'} size={14} color={on ? '#fff' : c.text2} />
              <Text numberOfLines={1} style={[s.itemText, on && { color: '#fff' }]}>{item.name}</Text>
            </Pressable>
          );
        }} />
    </View>
  );

  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style={c === dark ? 'light' : 'dark'} />
      {landscape ? <View style={{ flex: 1, flexDirection: 'row', gap: 14, padding: 14 }}><View style={{ flex: 1.3, gap: 12 }}>{video}{controls}</View><View style={{ flex: 1 }}>{library}</View></View>
        : <View style={{ flex: 1, padding: 14, gap: 12 }}>{video}{controls}{library}</View>}
    </SafeAreaView>
  );
}

const styles = (c: typeof dark) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  stage: { backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', justifyContent: 'center' },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.panel },
  logo: { width: 64, height: 64, borderRadius: 19, backgroundColor: '#0A84FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { color: c.text, fontSize: 20, fontWeight: '700' },
  emptySub: { color: c.text2, fontSize: 13, marginTop: 4 },
  card: { backgroundColor: c.panel, borderRadius: 20, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.sep },
  title: { color: c.text, fontSize: 15, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: c.text2, fontSize: 11, width: 44, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  play: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.text, alignItems: 'center', justifyContent: 'center' },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
  chipText: { color: c.text2, fontSize: 13, fontWeight: '600' },
  error: { color: '#FF453A', fontSize: 12, marginTop: 8 },
  library: { flex: 1, minHeight: 120 },
  libHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  segment: { flexDirection: 'row', backgroundColor: c.fill, borderRadius: 10, padding: 2 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
  segText: { color: c.text2, fontSize: 13, fontWeight: '600' },
  open: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 14, height: 34 },
  openText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, minHeight: 44, borderRadius: 10 },
  itemText: { color: c.text, fontSize: 14, fontWeight: '500', flex: 1 },
  emptyList: { color: c.text2, fontSize: 13, padding: 12 },
});
