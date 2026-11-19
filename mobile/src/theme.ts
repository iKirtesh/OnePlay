import { useColorScheme } from 'react-native';
export const light = { bg: '#F5F5F7', panel: '#FFFFFF', text: '#1D1D1F', text2: '#6E6E73', sep: 'rgba(0,0,0,0.09)', fill: 'rgba(0,0,0,0.06)', accent: '#007AFF', track: 'rgba(0,0,0,0.14)' };
export const dark = { bg: '#000000', panel: '#1C1C1E', text: '#F5F5F7', text2: '#A1A1A6', sep: 'rgba(255,255,255,0.1)', fill: 'rgba(255,255,255,0.09)', accent: '#0A84FF', track: 'rgba(255,255,255,0.2)' };
export type Theme = typeof dark;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
export const clock = (n: number) => {
  if (!Number.isFinite(n) || n < 0) return '0:00';
  const s = Math.floor(n), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
