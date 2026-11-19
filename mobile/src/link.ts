import { getConn, PcStatus } from './remote';

export type LiveStatus = PcStatus & { id?: string | null; recvAt: number };
type StatusFn = (s: LiveStatus) => void;

/** One live connection to OnePlay on the computer. Status arrives the moment it changes, and commands go back over the same line. */
class Link {
  private ws: WebSocket | null = null;
  private refs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1200;
  private listeners = new Set<StatusFn>();
  private stateListeners = new Set<(up: boolean) => void>();
  connected = false;
  last: LiveStatus | null = null;

  acquire() { this.refs++; if (!this.ws) this.open(); }
  release() { this.refs = Math.max(0, this.refs - 1); if (this.refs === 0) this.close(); }
  onStatus(fn: StatusFn) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  onState(fn: (up: boolean) => void) { this.stateListeners.add(fn); return () => { this.stateListeners.delete(fn); }; }

  send(cmd: Record<string, unknown>): boolean {
    if (!this.ws || !this.connected) return false;
    try { this.ws.send(JSON.stringify({ type: 'cmd', ...cmd })); return true; } catch { return false; }
  }
  private setUp(up: boolean) { if (this.connected !== up) { this.connected = up; this.stateListeners.forEach((f) => f(up)); } }
  private open() {
    const c = getConn();
    if (!c) return;
    const ws = new WebSocket(`ws://${c.host}/ws?t=${encodeURIComponent(c.token)}`);
    this.ws = ws;
    ws.onopen = () => { this.backoff = 1200; this.setUp(true); };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(String(e.data));
        if (m.type === 'status') { const { type: _t, ...rest } = m; this.last = { ...rest, recvAt: Date.now() }; this.listeners.forEach((f) => f(this.last!)); }
      } catch { /* ignore */ }
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.setUp(false);
      if (this.refs > 0) { this.timer = setTimeout(() => { this.timer = null; if (this.refs > 0 && !this.ws) this.open(); }, this.backoff); this.backoff = Math.min(this.backoff * 1.5, 8000); }
    };
  }
  private close() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const ws = this.ws; this.ws = null; this.setUp(false);
    try { ws?.close(); } catch { /* already closed */ }
  }
}
export const link = new Link();
