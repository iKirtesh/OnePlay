export {};
declare global {
  interface Window {
    oneplay: {
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
