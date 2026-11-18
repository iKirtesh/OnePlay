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
  stop: () => ipcRenderer.invoke("player:stop"),
  onStatus: (callback: (status: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on("player:property", listener);
    return () => ipcRenderer.removeListener("player:property", listener);
  }
});
