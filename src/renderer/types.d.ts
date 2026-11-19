export {};
declare global {
  type ShareState = { enabled: boolean; port: number; addresses: string[]; code: string; folders: string[]; devices: number };
  interface Window {
    oneplay: {
      platform: string;
      pathForFile: (file: File) => string;
      setMute: (muted: boolean) => Promise<boolean>;
      setSpeed: (speed: number) => Promise<boolean>;
      setLoop: (loop: boolean) => Promise<boolean>;
      toggleFullscreen: () => Promise<boolean>;
      onFullscreen: (callback: (on: boolean) => void) => () => void;
      openFile: () => Promise<string[]>;
      play: (filePath: string) => Promise<boolean>;
      togglePause: () => Promise<boolean>;
      seek: (seconds: number) => Promise<boolean>;
      setVolume: (volume: number) => Promise<boolean>;
      setVideoBounds: (bounds: { x: number; y: number; width: number; height: number }) => Promise<boolean>;
      addSubtitle: () => Promise<boolean>;
      cycleSub: () => Promise<boolean>;
      cycleAudio: () => Promise<boolean>;
      frameStep: (back: boolean) => Promise<boolean>;
      abLoop: () => Promise<boolean>;
      setChapter: (n: number) => Promise<boolean>;
      screenshot: () => Promise<string>;
      toggleOnTop: () => Promise<boolean>;
      shareState: () => Promise<ShareState>;
      shareToggle: (on: boolean) => Promise<ShareState>;
      shareAddFolder: () => Promise<ShareState>;
      shareRemoveFolder: (dir: string) => Promise<ShareState>;
      shareNewCode: () => Promise<ShareState>;
      shareForget: () => Promise<ShareState>;
      shareResume: (key: string, pos: number, dur: number) => Promise<boolean>;
      getShareResume: (key: string) => Promise<{ pos: number; dur: number; at: number } | null>;
      onShareState: (cb: (s: ShareState) => void) => () => void;
      stop: () => Promise<boolean>;
      onStatus: (callback: (status: any) => void) => () => void;
    };
  }
}
