# OnePlay

OnePlay is a free, cross-platform desktop media-player project for Windows, Linux, and macOS. It uses an Apple-inspired dark desktop interface, Electron + React + TypeScript for the application shell, and mpv as the playback engine. mpv uses FFmpeg libraries for media demuxing and decoding.

> **Development status: early scaffold / proof of concept.** The repository contains the initial desktop shell, file picker, basic playback controls, an mpv JSON-IPC process bridge, and packaging configuration. It is not yet a finished VLC replacement.

## Current implementation

- Electron desktop window with context isolation and a restricted preload bridge
- React + TypeScript interface
- Open local audio/video files
- Basic play/pause, seek, and volume commands through mpv JSON IPC
- Windows, Linux, and macOS packaging targets
- GitHub Actions matrix workflow for native platform builds

## Requirements

- Node.js 22+
- npm
- mpv installed and available on `PATH`
- Windows 10/11, a supported Linux desktop, or macOS

FFmpeg is used by mpv for decoding. This first development build expects an mpv executable installed on the host; it does not yet bundle mpv or its codec libraries.

## Run locally

```bash
npm install
npm run dev
```

The desktop shell is configured for Vite development. For a distributable build:

```bash
npm run build
```

Artifacts are written to `release/`. Build each OS on its native GitHub Actions runner; macOS signing and notarization require Apple credentials for public distribution.

## Playback integration note

mpv is launched as a separate process and controlled through its local JSON IPC socket / named pipe. In this first scaffold, its video window is separate from the OnePlay control window. Embedding mpv video into the OnePlay stage is a planned native-integration milestone; it requires platform-specific window-handle integration and testing.

mpv's IPC endpoint is local-only. Do not expose it over a network: the mpv manual warns that the protocol is intentionally unauthenticated and can execute commands.

## Roadmap

1. Embed the mpv render surface inside the OnePlay window on all three operating systems.
2. Bundle or reliably locate mpv per platform and provide first-run diagnostics.
3. Add media library scanning, playlists, resume position, and history using SQLite.
4. Add subtitles, audio/subtitle track selection, playback speed, keyboard shortcuts, and fullscreen.
5. Add hardware-acceleration controls, network streams, and robust error reporting.
6. Add tests, accessibility, signed installers, and release automation.

## Licensing

OnePlay's own source code is MIT-licensed. mpv and FFmpeg are separate third-party projects with their own licenses and build configurations. Before bundling or redistributing their binaries, include the applicable license texts and notices and review the exact FFmpeg build's LGPL/GPL configuration. Do not assume that the MIT license for OnePlay covers those dependencies.
