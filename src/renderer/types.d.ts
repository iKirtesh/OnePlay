export {};
declare global {
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
      stop: () => Promise<boolean>;
      onStatus: (callback: (status: any) => void) => () => void;
    };
  }
}
