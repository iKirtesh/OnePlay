import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("oneplay", {
  platform: process.platform,
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  setMute: (muted: boolean) => ipcRenderer.invoke("player:set-mute", muted),
  setSpeed: (speed: number) => ipcRenderer.invoke("player:set-speed", speed),
  setLoop: (loop: boolean) => ipcRenderer.invoke("player:set-loop", loop),
  toggleFullscreen: () => ipcRenderer.invoke("window:toggle-fullscreen"),
  onFullscreen: (callback: (on: boolean) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, on: boolean) => callback(on);
    ipcRenderer.on("player:fullscreen", listener);
    return () => ipcRenderer.removeListener("player:fullscreen", listener);
  },
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  play: (filePath: string) => ipcRenderer.invoke("player:play", filePath),
  togglePause: () => ipcRenderer.invoke("player:toggle-pause"),
  seek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds),
  setVolume: (volume: number) => ipcRenderer.invoke("player:set-volume", volume),
  setVideoBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke("player:set-video-bounds", bounds),
  addSubtitle: () => ipcRenderer.invoke("player:add-subtitle"),
  cycleSub: () => ipcRenderer.invoke("player:cycle-sub"),
  cycleAudio: () => ipcRenderer.invoke("player:cycle-audio"),
  frameStep: (back: boolean) => ipcRenderer.invoke("player:frame-step", back),
  abLoop: () => ipcRenderer.invoke("player:ab-loop"),
  setChapter: (n: number) => ipcRenderer.invoke("player:set-chapter", n),
  screenshot: () => ipcRenderer.invoke("player:screenshot"),
  toggleOnTop: () => ipcRenderer.invoke("window:toggle-on-top"),
  grabFrame: (file: string, t: number, w: number) => ipcRenderer.invoke("thumb:frame", file, t, w),
  subsGet: () => ipcRenderer.invoke("subs:get"),
  subsSave: (s: unknown) => ipcRenderer.invoke("subs:save", s),
  subsSearch: (q: string, lang: string) => ipcRenderer.invoke("subs:search", q, lang),
  subsDownload: (id: number, video: string, lang: string) => ipcRenderer.invoke("subs:download", id, video, lang),
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  openUpdate: (url: string) => ipcRenderer.invoke("update:open", url),
  shareStatus: (st: unknown) => ipcRenderer.invoke("share:status", st),
  listsGet: () => ipcRenderer.invoke("share:lists-get"),
  listsPut: (l: unknown) => ipcRenderer.invoke("share:lists-put", l),
  resolveNames: (keys: string[]) => ipcRenderer.invoke("share:resolve", keys),
  onLists: (cb: (l: any) => void) => { const f = (_e: Electron.IpcRendererEvent, l: any) => cb(l); ipcRenderer.on("share:lists", f); return () => ipcRenderer.removeListener("share:lists", f); },
  onRemote: (cb: (c: any) => void) => { const f = (_e: Electron.IpcRendererEvent, c: any) => cb(c); ipcRenderer.on("remote:cmd", f); return () => ipcRenderer.removeListener("remote:cmd", f); },
  shareState: () => ipcRenderer.invoke("share:state"),
  shareToggle: (on: boolean) => ipcRenderer.invoke("share:toggle", on),
  shareAddFolder: () => ipcRenderer.invoke("share:add-folder"),
  shareRemoveFolder: (dir: string) => ipcRenderer.invoke("share:remove-folder", dir),
  shareNewCode: () => ipcRenderer.invoke("share:new-code"),
  shareForget: () => ipcRenderer.invoke("share:forget"),
  shareResume: (key: string, pos: number, dur: number) => ipcRenderer.invoke("share:put-resume", key, pos, dur),
  getShareResume: (key: string) => ipcRenderer.invoke("share:get-resume", key),
  onShareState: (cb: (s: any) => void) => {
    const l = (_e: Electron.IpcRendererEvent, s: any) => cb(s);
    ipcRenderer.on("share:state", l);
    return () => ipcRenderer.removeListener("share:state", l);
  },
  stop: () => ipcRenderer.invoke("player:stop"),
  onStatus: (callback: (status: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on("player:property", listener);
    return () => ipcRenderer.removeListener("player:property", listener);
  }
});
