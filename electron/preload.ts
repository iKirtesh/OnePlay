import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("oneplay", {
  openFile: () => ipcRenderer.invoke("dialog:open-file"),
  play: (filePath: string) => ipcRenderer.invoke("player:play", filePath),
  togglePause: () => ipcRenderer.invoke("player:toggle-pause"),
  seek: (seconds: number) => ipcRenderer.invoke("player:seek", seconds),
  setVolume: (volume: number) => ipcRenderer.invoke("player:set-volume", volume),
  stop: () => ipcRenderer.invoke("player:stop"),
  onStatus: (callback: (status: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on("player:property", listener);
    return () => ipcRenderer.removeListener("player:property", listener);
  }
});
