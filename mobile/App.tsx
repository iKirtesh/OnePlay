import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { LibraryScreen, Play } from './src/Library';
import { PlayerScreen } from './src/PlayerScreen';

export default function App() {
  const [play, setPlay] = useState<Play | null>(null);
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {play ? (
        <PlayerScreen queue={play.queue} index={play.index} onClose={() => { void ScreenOrientation.unlockAsync().catch(() => {}); setPlay(null); }} />
      ) : (
        <LibraryScreen onPlay={setPlay} />
      )}
    </SafeAreaProvider>
  );
}
