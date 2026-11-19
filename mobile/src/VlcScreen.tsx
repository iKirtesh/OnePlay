import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Pressable, StatusBar as RNStatusBar, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import * as DocumentPicker from 'expo-document-picker';
import * as ScreenOrientation from 'expo-screen-orientation';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VLCPlayer } = require('react-native-vlc-media-player') as { VLCPlayer: React.ComponentType<any> };
import { clock } from './theme';
import type { Item } from './scan';

type Track = { id: number; name: string };
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const RATIOS = [undefined, '16:9', '4:3', '21:9', '1:1'] as const;

/** Plays almost any format (MKV, AVI, DTS, HEVC, external subtitles) with the VLC engine. */
export function VlcScreen({ item, onClose }: { item: Item; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [paused, setPaused] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [seek, setSeek] = useState<number | undefined>(undefined);
  const [rate, setRate] = useState(1);
  const [show, setShow] = useState(true);
  const [audio, setAudio] = useState<Track[]>([]);
  const [text, setText] = useState<Track[]>([]);
  const [audioSel, setAudioSel] = useState<number | undefined>();
  const [textSel, setTextSel] = useState<number | undefined>();
  const [subUri, setSubUri] = useState<string | undefined>();
  const [ratio, setRatio] = useState(0);
  const [sheet, setSheet] = useState<null | 'speed' | 'audio' | 'subs'>(null);
  const [error, setError] = useState('');
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cur = useRef(0); cur.current = pos;

  const poke = () => { setShow(true); if (hide.current) clearTimeout(hide.current); hide.current = setTimeout(() => setShow(false), 3500); };
  useEffect(() => { poke(); void activateKeepAwakeAsync('oneplay-vlc'); void ScreenOrientation.unlockAsync().catch(() => {}); return () => { void deactivateKeepAwake('oneplay-vlc'); }; }, []);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (sheet) setSheet(null); else onClose(); return true; }); return () => s.remove(); }, [sheet, onClose]);

  const jump = (secs: number) => { if (dur > 0) { setSeek(Math.max(0, Math.min(0.999, (cur.current + secs) / dur))); setTimeout(() => setSeek(undefined), 50); } };
  const loadSub = async () => {
    setSheet(null);
    const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!r.canceled && r.assets[0]) setSubUri(r.assets[0].uri.replace(/^file:\/\//, ''));
  };
  const rows: { key: string; label: string; on: boolean; pick: () => void }[] =
    sheet === 'speed' ? SPEEDS.map((r) => ({ key: String(r), label: `${r}x`, on: r === rate, pick: () => { setRate(r); setSheet(null); } }))
    : sheet === 'audio' ? audio.map((t) => ({ key: String(t.id), label: t.name, on: t.id === audioSel, pick: () => { setAudioSel(t.id); setSheet(null); } }))
    : sheet === 'subs' ? [{ key: 'file', label: 'Load subtitle file…', on: !!subUri, pick: () => void loadSub() }, { key: 'off', label: 'Off', on: textSel === -1, pick: () => { setTextSel(-1); setSheet(null); } }, ...text.map((t) => ({ key: String(t.id), label: t.name, on: t.id === textSel, pick: () => { setTextSel(t.id); setSheet(null); } }))]
    : [];
  const btn = (icon: React.ComponentProps<typeof Feather>['name'], on: () => void, size = 22, active = false) => (
    <Pressable onPress={() => { on(); poke(); }} hitSlop={8} style={{ padding: 8 }}><Feather name={icon} size={size} color={active ? '#0A84FF' : '#fff'} /></Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <RNStatusBar hidden />
      <VLCPlayer
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        source={{ uri: item.uri }}
        paused={paused} rate={rate} seek={seek} audioTrack={audioSel} textTrack={textSel} subtitleUri={subUri}
        videoAspectRatio={RATIOS[ratio]} playInBackground
        onLoad={(e: { duration: number; audioTracks?: Track[]; textTracks?: Track[] }) => { setDur(e.duration / 1000); setAudio(e.audioTracks ?? []); setText(e.textTracks ?? []); }}
        onProgress={(e: { currentTime: number; duration: number }) => { setPos(e.currentTime / 1000); if (e.duration) setDur(e.duration / 1000); }}
        onError={() => setError('VLC could not play this file')}
        onEnd={() => setPaused(true)}
      />
      <Pressable onPress={() => (show ? setShow(false) : poke())} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {error ? <View pointerEvents="none" style={{ position: 'absolute', top: height * 0.45, left: 24, right: 24 }}><Text style={{ color: '#fff', textAlign: 'center' }}>{error}</Text></View> : null}
      {show ? (
        <>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 32, paddingHorizontal: 8, paddingBottom: 18, backgroundColor: 'rgba(0,0,0,0.55)', flexDirection: 'row', alignItems: 'center' }}>
            {btn('chevron-down', onClose, 28)}
            <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: '#ccc', fontSize: 12 }}>VLC engine</Text></View>
          </View>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingBottom: 18, paddingHorizontal: 12, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 12, width: 52, textAlign: 'center' }}>{clock(pos)}</Text>
              <Slider style={{ flex: 1, height: 36 }} minimumValue={0} maximumValue={Math.max(dur, 1)} value={pos} minimumTrackTintColor="#0A84FF" maximumTrackTintColor="rgba(255,255,255,0.3)" thumbTintColor="#fff"
                onSlidingComplete={(v) => { if (dur > 0) { setSeek(Math.min(0.999, v / dur)); setTimeout(() => setSeek(undefined), 50); } poke(); }} />
              <Text style={{ color: '#fff', fontSize: 12, width: 52, textAlign: 'center' }}>-{clock(Math.max(0, dur - pos))}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              {btn('rotate-ccw', () => jump(-10), 24)}
              <Pressable onPress={() => { setPaused((p) => !p); poke(); }} style={{ padding: 10 }}><Feather name={paused ? 'play' : 'pause'} size={38} color="#fff" /></Pressable>
              {btn('rotate-cw', () => jump(10), 24)}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
              <Pressable onPress={() => { setSheet('speed'); poke(); }} style={{ padding: 8 }}><Text style={{ color: rate === 1 ? '#fff' : '#0A84FF', fontWeight: '600' }}>{rate}x</Text></Pressable>
              {btn('headphones', () => setSheet('audio'), 20, audio.length > 1)}
              {btn('type', () => setSheet('subs'), 20, !!subUri || (textSel ?? -1) >= 0)}
              {btn('maximize', () => setRatio((r) => (r + 1) % RATIOS.length), 20, ratio > 0)}
            </View>
          </View>
        </>
      ) : null}
      <Modal visible={sheet !== null} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable onPress={() => setSheet(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' }}>
          <View style={{ width: Math.min(width, 460), maxHeight: height * 0.8, backgroundColor: '#1C1C1E', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingVertical: 8 }}>
            {rows.length === 0 ? <Text style={{ color: '#A1A1A6', textAlign: 'center', padding: 20 }}>No tracks in this file</Text> : null}
            {rows.map((r) => (
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
