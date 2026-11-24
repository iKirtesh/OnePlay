import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LibraryScreen, Play } from './src/Library';
import { PlayerScreen } from './src/PlayerScreen';
import { VlcScreen } from './src/VlcScreen';
import { PcScreen } from './src/PcScreen';
import { PlaylistsScreen } from './src/PlaylistsScreen';
import type { Item } from './src/scan';
import { loadConn } from './src/remote';
import { resumePhoneShare } from './src/phoneShare';

export default function App() {
  useEffect(() => { void loadConn().then((c) => { if (c) void resumePhoneShare(); }); }, []);
  const [play, setPlay] = useState<Play | null>(null);
  const [vlc, setVlc] = useState<Item | null>(null);
  const [pc, setPc] = useState(false);
  const [pls, setPls] = useState(false);
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {vlc ? (
        <VlcScreen item={vlc} onClose={() => setVlc(null)} />
      ) : play ? (
        <PlayerScreen queue={play.queue} index={play.index} onVlc={setVlc} onClose={() => { void ScreenOrientation.unlockAsync().catch(() => {}); setPlay(null); }} />
      ) : pls ? (
        <PlaylistsScreen onPlay={setPlay} onClose={() => setPls(false)} />
      ) : pc ? (
        <PcScreen onPlay={setPlay} onClose={() => setPc(false)} />
      ) : (
        <LibraryScreen onPlay={setPlay} onPc={() => setPc(true)} onLists={() => setPls(true)} />
      )}
    </SafeAreaProvider>
  );
}
