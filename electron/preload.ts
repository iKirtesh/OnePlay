import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("oneplay", {
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  play: (filePath: string) => ipcRenderer.invoke("player:play", filePath),
  togglePause: () => ipcRenderer.invoke("player:toggle-pause"),
  seek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds),
  setVolume: (volume: number) => ipcRenderer.invoke("player:set-volume", volume),
  stop: () => ipcRenderer.invoke("player:stop"),
  onStatus: (callback: (status: PlayerStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: PlayerStatus) => callback(status);
    ipcRenderer.on("player:status", listener);
    return () => ipcRenderer.removeListener("player:status", listener);
  }
});

export interface PlayerStatus {
  title: string;
  paused: boolean;
  position: number;
  duration: number;
  volume: number;
  filePath: string | null;
}
