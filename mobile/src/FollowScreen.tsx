import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './theme';
import { getLibrary, Item } from './scan';
import { fileUrl, findPcItem } from './remote';
import { link, LiveStatus } from './link';
import { PlayerScreen } from './PlayerScreen';

/** Plays whatever the computer is playing, in step with it. When the computer switches video, this switches too. */
export function FollowScreen({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const [st, setSt] = useState<LiveStatus | null>(link.last);
  const [up, setUp] = useState(link.connected);
  const [item, setItem] = useState<Item | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    link.acquire();
    const a = link.onStatus(setSt), b = link.onState(setUp);
    setSt(link.last); setUp(link.connected);
    return () => { a(); b(); link.release(); };
  }, []);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; }); return () => s.remove(); }, [onClose]);

  const title = st?.online ? st.title ?? '' : '';
  const id = st?.id ?? null;
  useEffect(() => {
    if (!title) return;
    if (item && item.name.toLowerCase() === title.toLowerCase()) return;
    let alive = true;
    void (async () => {
      setProblem('');
      // Prefer the shared copy on the computer: it is the same file, so the two stay in step.
      if (id) {
        const hit = await findPcItem(id);
        if (hit && alive) { setItem({ id, uri: fileUrl(id), name: hit.item.name, kind: /^(mp3|flac|wav|aac|ogg|opus|m4a)$/.test(hit.item.ext) ? 'audio' : 'video', duration: 0, folderId: hit.folder.id, added: 0 }); return; }
      }
      const local = getLibrary()?.items.find((i) => i.name.toLowerCase() === title.toLowerCase());
      if (local && alive) { setItem(local); return; }
      if (alive) { setItem(null); setProblem(`"${title}" is not in a folder shared from your computer and is not on this phone. Add its folder in OnePlay on the computer (Wi-Fi button) to watch it here.`); }
    })();
    return () => { alive = false; };
  }, [title, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (item && title && item.name.toLowerCase() === title.toLowerCase()) return <PlayerScreen key={item.uri} queue={[item]} index={0} sync onClose={onClose} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
      {problem ? <Feather name="alert-circle" size={40} color="#FF9F0A" /> : <ActivityIndicator color={t.accent} />}
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{problem ? 'Cannot play this one here' : !up ? 'Connecting to your computer…' : 'Waiting for your computer to play something…'}</Text>
      <Text style={{ color: t.text2, textAlign: 'center', lineHeight: 20 }}>{problem || 'Start a video in OnePlay on the computer. It will begin here and stay in step.'}</Text>
      <Pressable onPress={onClose} style={{ marginTop: 10, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, backgroundColor: t.fill }}><Text style={{ color: t.text, fontWeight: '600' }}>Stop watching together</Text></Pressable>
    </SafeAreaView>
  );
}
