import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Modal, PanResponder, Pressable, StatusBar as RNStatusBar, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Brightness from 'expo-brightness';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { clock } from './theme';
import type { Item } from './scan';
import * as DocumentPicker from 'expo-document-picker';
import { getResume, saveResume } from './storage';
import { pushResume, remoteResume } from './remote';
import { link, LiveStatus } from './link';
import { Cue, cueAt, findSibling, parseSubs, readSubs } from './subs';
import { PcSub, searchSubsOnPc, subsTextFromPc } from './remote';

// Many sites refuse requests that do not look like a browser (HTTP 403), so web links are opened with browser-like headers.
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const sourceFor = (uri: string, title: string) => {
  const web = /^https?:\/\//i.test(uri);
  const origin = web ? /^(https?:\/\/[^/]+)/i.exec(uri)?.[1] : undefined;
  return { uri, metadata: { title }, ...(web ? { headers: { 'User-Agent': BROWSER_UA, Accept: '*/*', ...(origin ? { Referer: `${origin}/` } : {}) } } : {}) };
};
const friendlyError = (m: string) => (/403/.test(m) ? 'The website refused to stream this link (403). Try the VLC engine below.' : /404/.test(m) ? 'The link was not found (404). Check the address.' : /UnknownHost|Unable to connect|timeout/i.test(m) ? 'Could not reach the server. Check your internet connection.' : m);
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
const SLEEP = [0, 15, 30, 45, 60, 90];
const FITS = ['contain', 'cover', 'fill'] as const;
const FIT_LABEL = { contain: 'Fit', cover: 'Fill screen', fill: 'Stretch' } as const;
type Sheet = null | 'speed' | 'audio' | 'subs' | 'sleep' | 'more' | 'subsearch';
type Track = { id: string; label: string; language: string } | null;

export function PlayerScreen({ queue, index: start, onClose, onVlc, sync }: { queue: Item[]; index: number; onClose: () => void; onVlc?: (i: Item) => void; sync?: boolean }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  const item = queue[index];
  const [playing, setPlaying] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(item?.duration ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [show, setShow] = useState(true);
  const [locked, setLocked] = useState(false);
  const [fit, setFit] = useState<(typeof FITS)[number]>('contain');
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [audioTracks, setAudioTracks] = useState<NonNullable<Track>[]>([]);
  const [subTracks, setSubTracks] = useState<NonNullable<Track>[]>([]);
  const [audioSel, setAudioSel] = useState<string | null>(null);
  const [subSel, setSubSel] = useState<string | null>(null);
  const [hud, setHud] = useState<{ icon: React.ComponentProps<typeof Feather>['name']; text: string } | null>(null);
  const [sleepLeft, setSleepLeft] = useState(0);
  const [error, setError] = useState('');
  const [cues, setCues] = useState<Cue[]>([]);
  const [subDelay, setSubDelay] = useState(0);
  const [hits, setHits] = useState<PcSub[] | string | null>(null);
  const [subSize, setSubSize] = useState(18);
  const [ab, setAb] = useState<{ a: number | null; b: number | null }>({ a: null, b: null });
  const viewRef = useRef<VideoView>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useVideoPlayer(null, (p) => { p.timeUpdateEventInterval = 0.25; p.showNowPlayingNotification = true; p.staysActiveInBackground = true; });
  const live = useRef({ index, queue, loop, pos: 0, dur: 0 });
  live.current = { index, queue, loop, pos, dur };
  const lastPush = useRef(0);
  const syncOn = !!sync;
  const applyRef = useRef<(st: LiveStatus) => void>(() => {});
  // Watch together: follow the computer's play/pause, position and speed, and correct drift.
  applyRef.current = (st) => {
    const cur = live.current.queue[live.current.index];
    if (!st.online || !cur || (st.title ?? '').toLowerCase() !== cur.name.toLowerCase()) return;
    const base = st.speed || 1;
    if (st.paused && player.playing) player.pause(); else if (!st.paused && !player.playing) player.play();
    const expected = (st.position ?? 0) + (st.paused ? 0 : ((Date.now() - st.recvAt) / 1000) * base);
    const drift = player.currentTime - expected;
    if (Math.abs(drift) > 0.8) player.currentTime = Math.max(0, expected);
    player.playbackRate = !st.paused && Math.abs(drift) > 0.15 && Math.abs(drift) <= 0.8 ? base * (drift > 0 ? 0.97 : 1.03) : base;
    setSpeed((s) => (s === base ? s : base));
  };
  useEffect(() => {
    if (!syncOn) return;
    link.acquire();
    const off = link.onStatus((st) => applyRef.current(st));
    return () => { off(); link.release(); };
  }, [syncOn]);
  const abRef = useRef(ab); abRef.current = ab;
  const isAudio = item?.kind === 'audio';

  const flash = useCallback((icon: NonNullable<typeof hud>['icon'], text: string) => {
    setHud({ icon, text });
    if (hudTimer.current) clearTimeout(hudTimer.current);
    hudTimer.current = setTimeout(() => setHud(null), 800);
  }, []);
  const poke = useCallback(() => {
    setShow(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShow(false), 3500);
  }, []);

  // Load the current file and continue where you left off.
  useEffect(() => {
    if (!item) return;
    let alive = true;
    setError(''); setPos(0); setDur(item.duration); setAudioTracks([]); setSubTracks([]); setAudioSel(null); setSubSel(null); setCues([]); setSubDelay(0); setAb({ a: null, b: null });
    void findSibling(item.uri).then((c) => { if (alive && c) setCues(c); });
    void (async () => {
      try {
        await player.replaceAsync(sourceFor(item.uri, item.name));
        if (!alive) return;
        player.loop = live.current.loop;
        player.playbackRate = speed;
        const r = getResume(item.uri);
        let startAt = r?.pos ?? 0;
        const rem = syncOn ? null : await remoteResume(item.name);
        if (rem && rem.at > (r?.at ?? 0)) startAt = rem.pos;
        if (!alive) return;
        if (!syncOn && startAt > 5) player.currentTime = startAt;
        player.play();
        if (syncOn && link.last) applyRef.current(link.last);
      } catch (e) { if (alive) setError(friendlyError(String((e as Error)?.message ?? 'Cannot play this file'))); }
    })();
    return () => { alive = false; saveResume(item.uri, live.current.pos, live.current.dur); pushResume(item.name, live.current.pos, live.current.dur); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uri]);

  useEffect(() => {
    const readTracks = () => {
      setAudioTracks(player.availableAudioTracks as NonNullable<Track>[]);
      setSubTracks(player.availableSubtitleTracks as NonNullable<Track>[]);
      setAudioSel(player.audioTrack?.id ?? null);
      setSubSel(player.subtitleTrack?.id ?? null);
    };
    const subs = [
      player.addListener('playingChange', (e) => setPlaying(e.isPlaying)),
      player.addListener('timeUpdate', (e) => { setPos(e.currentTime); if (Date.now() - lastPush.current > 20000 && e.currentTime > 5) { lastPush.current = Date.now(); const c = live.current.queue[live.current.index]; if (c) pushResume(c.name, e.currentTime, live.current.dur); } const x = abRef.current; if (x.a != null && x.b != null && e.currentTime >= x.b) player.currentTime = x.a; }),
      player.addListener('sourceLoad', (e) => { setDur(e.duration); readTracks(); }),
      player.addListener('availableAudioTracksChange', readTracks),
      player.addListener('availableSubtitleTracksChange', readTracks),
      player.addListener('statusChange', (e) => { if (e.status === 'error') setError(friendlyError(e.error?.message ?? 'Cannot play this file')); }),
      player.addListener('playToEnd', () => {
        const l = live.current;
        const cur = l.queue[l.index]; if (cur) saveResume(cur.uri, 0, 1);
        if (!syncOn && !l.loop && l.index < l.queue.length - 1) setIndex(l.index + 1);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player]);

  useEffect(() => { poke(); }, [poke]);
  useEffect(() => { void activateKeepAwakeAsync('oneplay'); return () => { void deactivateKeepAwake('oneplay'); }; }, []);
  useEffect(() => { void ScreenOrientation.unlockAsync().catch(() => {}); return () => { void ScreenOrientation.unlockAsync().catch(() => {}); }; }, []);
  useEffect(() => () => { void Brightness.restoreSystemBrightnessAsync().catch(() => {}); }, []);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (sheet) setSheet(null); else onClose(); return true; }); return () => s.remove(); }, [sheet, onClose]);

  // Sleep timer counts down in minutes and pauses playback at zero.
  useEffect(() => {
    if (sleepLeft <= 0) return;
    const id = setTimeout(() => { if (sleepLeft <= 1) { player.pause(); setSleepLeft(0); flash('moon', 'Sleep timer'); } else setSleepLeft(sleepLeft - 1); }, 60000);
    return () => clearTimeout(id);
  }, [sleepLeft, player, flash]);

  const seekTo = (t: number) => { const d = live.current.dur || Infinity; const c = Math.max(0, Math.min(d, t)); player.currentTime = c; if (syncOn) link.send({ cmd: 'seekTo', to: c }); };
  const skip = (s: number) => { seekTo(live.current.pos + s); flash(s > 0 ? 'fast-forward' : 'rewind', `${s > 0 ? '+' : ''}${s}s`); };
  const toggle = () => { const was = player.playing; if (was) player.pause(); else player.play(); if (syncOn) link.send({ cmd: was ? 'pause' : 'play' }); };
  const go = (d: number) => { if (syncOn) { link.send({ cmd: d > 0 ? 'next' : 'prev' }); return; } const n = live.current.index + d; if (n >= 0 && n < live.current.queue.length) setIndex(n); };
  const setRate = (r: number) => { player.playbackRate = r; setSpeed(r); if (syncOn) link.send({ cmd: 'speed', value: r }); flash('zap', `${r}x`); };

  // Gestures: swipe sideways = seek, left edge up/down = brightness, right edge up/down = volume, double tap sides = skip.
  const g = useRef({ mode: '' as '' | 'seek' | 'bright' | 'vol', start: 0, sx: 0, sy: 0, lastTap: 0, lastSide: 0, base: 0 });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { g.current.mode = ''; g.current.sx = e.nativeEvent.pageX; g.current.sy = e.nativeEvent.pageY; },
    onPanResponderMove: async (e, s) => {
      const st = g.current; const w = width, h = height;
      if (!st.mode) {
        if (Math.abs(s.dx) < 14 && Math.abs(s.dy) < 14) return;
        if (Math.abs(s.dx) > Math.abs(s.dy)) { st.mode = 'seek'; st.base = live.current.pos; }
        else if (st.sx < w / 2) { st.mode = 'bright'; try { st.base = await Brightness.getBrightnessAsync(); } catch { st.base = 0.5; } }
        else { st.mode = 'vol'; st.base = player.volume; }
      }
      if (st.mode === 'seek') { const t = Math.max(0, Math.min(live.current.dur || 1e9, st.base + s.dx / 6)); st.start = t; flash(s.dx > 0 ? 'fast-forward' : 'rewind', `${clock(t)}  (${s.dx > 0 ? '+' : '-'}${Math.round(Math.abs(t - st.base))}s)`); }
      else if (st.mode === 'bright') { const v = Math.max(0.02, Math.min(1, st.base - s.dy / (h * 0.8))); void Brightness.setBrightnessAsync(v).catch(() => {}); flash('sun', `${Math.round(v * 100)}%`); }
      else if (st.mode === 'vol') { const v = Math.max(0, Math.min(1, st.base - s.dy / (h * 0.8))); player.volume = v; flash(v === 0 ? 'volume-x' : 'volume-2', `${Math.round(v * 100)}%`); }
    },
    onPanResponderRelease: (e, s) => {
      const st = g.current;
      if (st.mode === 'seek') { seekTo(st.start); st.mode = ''; return; }
      if (st.mode) { st.mode = ''; return; }
      if (Math.abs(s.dx) > 10 || Math.abs(s.dy) > 10) return;
      const now = Date.now(); const side = e.nativeEvent.pageX < width / 2 ? -1 : 1;
      if (now - st.lastTap < 320 && side === st.lastSide) { skip(side * 10); st.lastTap = 0; return; }
      st.lastTap = now; st.lastSide = side;
      setTimeout(() => { if (g.current.lastTap === now) { if (hideTimer.current) clearTimeout(hideTimer.current); setShow((v) => { if (!v) poke(); return !v; }); } }, 330);
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [width, height]);

  const searchOnline = () => {
    setHits(null); setSheet('subsearch');
    void searchSubsOnPc(item?.name ?? '').then((r) => setHits(r.length ? r : 'No subtitles found')).catch((e: Error) => setHits(e.message));
  };
  const useHit = (h: PcSub) => {
    setSheet(null); flash('type', 'Downloading subtitles…');
    void subsTextFromPc(h.fileId).then((txt) => { const c = parseSubs(txt); if (!c.length) throw new Error('Empty subtitle file'); setCues(c); setSubSel(null); flash('type', `${c.length} lines loaded`); }).catch((e: Error) => flash('alert-circle', e.message.slice(0, 60)));
  };
  const loadSubFile = async () => {
    setSheet(null);
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    try { const c = await readSubs(r.assets[0].uri); if (!c.length) throw new Error('empty'); setCues(c); setSubSel(null); flash('type', `${c.length} lines loaded`); }
    catch { flash('alert-circle', 'Not a valid .srt/.vtt'); }
  };
  const step = (d: number) => { player.pause(); seekTo(live.current.pos + d * 0.042); };
  const markAb = () => {
    const t = live.current.pos;
    if (ab.a == null) { setAb({ a: t, b: null }); flash('repeat', `A ${clock(t)}`); }
    else if (ab.b == null && t > ab.a) { setAb({ a: ab.a, b: t }); flash('repeat', `A-B ${clock(ab.a)} - ${clock(t)}`); }
    else { setAb({ a: null, b: null }); flash('repeat', 'A-B off'); }
  };
  const rotate = async () => {
    const o = await ScreenOrientation.getOrientationAsync();
    const portrait = o === ScreenOrientation.Orientation.PORTRAIT_UP || o === ScreenOrientation.Orientation.PORTRAIT_DOWN;
    await ScreenOrientation.lockAsync(portrait ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP);
  };
  const pickAudio = (id: string | null) => { const t = audioTracks.find((x) => x.id === id); if (t) { player.audioTrack = t as never; setAudioSel(t.id); } setSheet(null); };
  const pickSub = (id: string | null) => { const t = subTracks.find((x) => x.id === id) ?? null; player.subtitleTrack = t as never; setSubSel(t?.id ?? null); setSheet(null); };
  const trackName = (t: NonNullable<Track>, i: number) => [t.label || `Track ${i + 1}`, t.language && t.language !== t.label ? `(${t.language})` : ''].filter(Boolean).join(' ');

  const shown = show && !locked;
  const btn = (icon: React.ComponentProps<typeof Feather>['name'], on: () => void, size = 22, active = false) => (
    <Pressable onPress={() => { on(); poke(); }} hitSlop={8} style={{ padding: 8 }}><Feather name={icon} size={size} color={active ? '#0A84FF' : '#fff'} /></Pressable>
  );
  const sheetRows: { key: string; label: string; on: boolean; pick: () => void }[] =
    sheet === 'speed' ? SPEEDS.map((r) => ({ key: String(r), label: `${r}x`, on: r === speed, pick: () => { setRate(r); setSheet(null); } }))
    : sheet === 'sleep' ? SLEEP.map((m) => ({ key: String(m), label: m ? `${m} minutes` : 'Off', on: m === sleepLeft || (!m && !sleepLeft), pick: () => { setSleepLeft(m); setSheet(null); if (m) flash('moon', `Sleep in ${m} min`); } }))
    : sheet === 'audio' ? audioTracks.map((t, i) => ({ key: t.id, label: trackName(t, i), on: t.id === audioSel, pick: () => pickAudio(t.id) }))
    : sheet === 'more' ? [
        ...(audioTracks.length > 1 ? [{ key: 'audio', label: 'Audio track…', on: false, pick: () => setSheet('audio') }] : []),
        { key: 'fit', label: `Aspect: ${FIT_LABEL[fit]} (tap to change)`, on: fit !== 'contain', pick: () => { const n = FITS[(FITS.indexOf(fit) + 1) % FITS.length] ?? 'contain'; setFit(n); flash('maximize', FIT_LABEL[n]); setSheet(null); } },
        { key: 'loop', label: loop ? 'Repeat: on' : 'Repeat: off', on: loop, pick: () => { player.loop = !loop; setLoop(!loop); flash('repeat', !loop ? 'Repeat on' : 'Repeat off'); setSheet(null); } },
        { key: 'sleep', label: sleepLeft > 0 ? `Sleep timer: ${sleepLeft} min left` : 'Sleep timer…', on: sleepLeft > 0, pick: () => setSheet('sleep') },
        { key: 'pip', label: 'Picture in picture', on: false, pick: () => { setSheet(null); void viewRef.current?.startPictureInPicture(); } },
        ...(onVlc && item ? [{ key: 'vlc', label: 'Play with VLC engine (more formats)', on: false, pick: () => { player.pause(); onVlc(item); } }] : []),
        { key: 'ab', label: ab.a == null ? 'A-B repeat: set start' : ab.b == null ? 'A-B repeat: set end' : 'A-B repeat: clear', on: ab.a != null, pick: () => { markAb(); setSheet(null); } },
        { key: 'fb', label: 'Previous frame', on: false, pick: () => step(-1) },
        { key: 'ff', label: 'Next frame', on: false, pick: () => step(1) },
        { key: 'd-', label: `Subtitle delay -0.5s (${subDelay.toFixed(1)}s)`, on: false, pick: () => setSubDelay((d) => d - 0.5) },
        { key: 'd+', label: `Subtitle delay +0.5s (${subDelay.toFixed(1)}s)`, on: false, pick: () => setSubDelay((d) => d + 0.5) },
        { key: 's-', label: 'Subtitle text smaller', on: false, pick: () => setSubSize((z) => Math.max(10, z - 2)) },
        { key: 's+', label: 'Subtitle text larger', on: false, pick: () => setSubSize((z) => Math.min(40, z + 2)) },
      ]
    : sheet === 'subsearch' ? (typeof hits === 'string' ? [{ key: 'msg', label: hits, on: false, pick: () => setSheet('subs') }] : hits === null ? [{ key: 'wait', label: 'Searching…', on: false, pick: () => {} }] : hits.slice(0, 15).map((h) => ({ key: String(h.fileId), label: `${h.release}  ·  ${h.language}`, on: false, pick: () => useHit(h) })))
    : sheet === 'subs' ? [{ key: 'off', label: 'Off', on: !subSel && cues.length === 0, pick: () => { pickSub(null); setCues([]); } }, { key: 'online', label: 'Search online (uses your computer)…', on: false, pick: searchOnline }, { key: 'file', label: 'Load subtitle file (.srt / .vtt)…', on: cues.length > 0, pick: () => void loadSubFile() }, ...subTracks.map((t, i) => ({ key: t.id, label: trackName(t, i), on: t.id === subSel, pick: () => pickSub(t.id) }))]
    : [];

  if (!item) return null;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <RNStatusBar hidden />
      <VideoView ref={viewRef} player={player} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit={fit} nativeControls={false} allowsPictureInPicture startsPictureInPictureAutomatically />
      {isAudio ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Feather name="music" size={96} color="#3A3A3C" /></View> : null}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} {...pan.panHandlers} />

      {cues.length ? (() => { const c = cueAt(cues, pos - subDelay); return c ? <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, bottom: shown ? 120 : 36, alignItems: 'center' }}><Text style={{ color: '#fff', fontSize: subSize, textAlign: 'center', fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 }, backgroundColor: 'rgba(0,0,0,0.35)' }}>{c.text}</Text></View> : null; })() : null}
      {hud ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: height * 0.38, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', gap: 4 }}>
          <Feather name={hud.icon} size={28} color="#fff" /><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{hud.text}</Text>
        </View>
      ) : null}
      {error ? <View style={{ position: 'absolute', top: height * 0.42, left: 24, right: 24, alignItems: 'center', gap: 12 }}><Text style={{ color: '#fff', textAlign: 'center' }}>{error}</Text>{onVlc && item ? <Pressable onPress={() => onVlc(item)} style={{ backgroundColor: '#0A84FF', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}><Text style={{ color: '#fff', fontWeight: '600' }}>Try VLC engine</Text></Pressable> : null}</View> : null}

      {locked ? (
        <Pressable onPress={() => { setLocked(false); poke(); }} style={{ position: 'absolute', top: 40, right: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, padding: 12 }}><Feather name="lock" size={20} color="#fff" /></Pressable>
      ) : null}

      {shown ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 24, paddingHorizontal: 8, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.4)', flexDirection: 'row', alignItems: 'center' }}>
            {btn('chevron-down', onClose, 28)}
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{item.name}</Text>{syncOn ? <Text style={{ color: '#7FD1FF', fontSize: 12 }}>Watching together with your computer</Text> : queue.length > 1 ? <Text style={{ color: '#ccc', fontSize: 12 }}>{index + 1} / {queue.length}</Text> : null}</View>
            {btn('lock', () => setLocked(true))}
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', paddingBottom: 12, paddingHorizontal: 12, paddingTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12, width: 52, textAlign: 'center' }}>{clock(scrub ?? pos)}</Text>
              <Slider style={{ flex: 1, height: 36 }} minimumValue={0} maximumValue={Math.max(dur, 1)} value={scrub ?? pos} minimumTrackTintColor="#0A84FF" maximumTrackTintColor="rgba(255,255,255,0.3)" thumbTintColor="#fff"
                onSlidingStart={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }} onValueChange={(v) => setScrub(v)} onSlidingComplete={(v) => { seekTo(v); setScrub(null); poke(); }} />
              <Text style={{ color: '#fff', fontSize: 12, width: 52, textAlign: 'center' }}>-{clock(Math.max(0, dur - pos))}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <View style={{ flex: 1, alignItems: 'flex-start' }}><Pressable onPress={() => { setSheet('speed'); poke(); }} style={{ padding: 8 }}><Text style={{ color: speed === 1 ? '#fff' : '#0A84FF', fontWeight: '600' }}>{speed}x</Text></Pressable></View>
              {btn('skip-back', () => go(-1), 24)}
              {btn('rotate-ccw', () => skip(-10), 24)}
              <Pressable onPress={() => { toggle(); poke(); }} style={{ padding: 10 }}><Feather name={playing ? 'pause' : 'play'} size={38} color="#fff" /></Pressable>
              {btn('rotate-cw', () => skip(10), 24)}
              {btn('skip-forward', () => go(1), 24)}
              <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
                {btn('type', () => setSheet('subs'), 20, !!subSel || cues.length > 0)}
                {btn('more-horizontal', () => setSheet('more'), 22, ab.a != null || loop || sleepLeft > 0 || fit !== 'contain' || audioTracks.length > 1)}
              </View>
            </View>
          </View>
        </>
      ) : null}

      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable onPress={() => setSheet(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={{ width: Math.min(width, 460), maxHeight: height * 0.8, backgroundColor: '#1C1C1E', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 8 }}>
            <Text style={{ color: '#A1A1A6', textAlign: 'center', padding: 8, fontWeight: '600' }}>{sheet === 'speed' ? 'Playback speed' : sheet === 'audio' ? 'Audio track' : sheet === 'subs' ? 'Subtitles' : sheet === 'subsearch' ? 'Online subtitles' : sheet === 'more' ? 'More' : 'Sleep timer'}</Text>
            {sheetRows.length === 0 ? <Text style={{ color: '#A1A1A6', textAlign: 'center', padding: 20 }}>No tracks in this file</Text> : null}
            {sheetRows.map((r) => (
              <Pressable key={r.key} onPress={r.pick} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 14 }}>
                <Text style={{ color: r.on ? '#0A84FF' : '#fff', fontSize: 16 }}>{r.label}</Text>{r.on ? <Feather name="check" size={18} color="#0A84FF" /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
