# OnePlay

OnePlay is a free, cross-platform desktop media-player project for Windows, Linux, and macOS. It uses an Apple-inspired dark desktop interface, Electron + React + TypeScript for the application shell, and mpv as the playback engine. mpv uses FFmpeg libraries for media demuxing and decoding.

> **Development status: early prototype.** The project now includes a native mpv video-host integration path for Windows and Linux/X11. This has been committed but still requires native OS testing before it can be considered stable.

## Current implementation

- Electron desktop window with context isolation and a restricted preload bridge
- React + TypeScript interface
- Open local audio/video files
- Basic play/pause, seek, and volume commands through mpv JSON IPC
- Embedded mpv video surface using a native child window on Windows and Linux/X11
- Video-host bounds follow the OnePlay player stage when the app window resizes
- macOS and Linux/Wayland currently use a separate mpv video window fallback
- Windows, Linux, and macOS packaging targets
- GitHub Actions matrix workflow for native platform builds

## Requirements

- Node.js 22+
- npm
- mpv installed and available on `PATH`
- Windows 10/11, a supported Linux desktop, or macOS

FFmpeg is used by mpv for decoding. This development build expects an mpv executable installed on the host; it does not yet bundle mpv or its codec libraries.

## Download

Get the latest installers from the [Releases page](https://github.com/iKirtesh/OnePlay/releases/latest):

| System | File |
| --- | --- |
| Windows 10/11 | `OnePlay-<version>-win-x64.exe` (installer) or the portable `.exe` |
| macOS (Apple Silicon + Intel) | `OnePlay-<version>-mac-universal.dmg` |
| Ubuntu / Debian | `OnePlay-<version>-linux-amd64.deb` (`sudo apt install ./OnePlay-*.deb`, also installs mpv) or the `.AppImage` |

**Install mpv first** (OnePlay does not bundle it yet): Windows `winget install mpv` or `scoop install mpv`; macOS `brew install mpv`; Ubuntu `sudo apt install mpv`.

**First launch (builds are unsigned):** on macOS right-click the app and choose Open (or run `xattr -cr /Applications/OnePlay.app`); on Windows choose *More info > Run anyway* in SmartScreen; AppImage needs `chmod +x`.

Shortcuts: Space/K play-pause, arrows seek and volume (Shift = 30 s), M mute, F fullscreen, N/P next/previous, L repeat. You can also drag files onto the window.

## Mobile (Android + iPhone)

A separate phone app lives in [`mobile/`](mobile) (Expo + React Native, native video player). Builds appear on the Releases page as `mobile-<n>`: an Android `.apk` and an **unsigned** iOS `.ipa` that must be sideloaded with AltStore or Sideloadly (free Apple ID apps expire after 7 days). Untested on physical devices.

## Run locally

```bash
npm install
npm run dev
```

For a distributable build:

```bash
npm run build
```

Artifacts are written to `release/`. Build each OS on its native GitHub Actions runner; macOS signing and notarization require Apple credentials for public distribution.

## Video embedding details

On Windows, OnePlay creates a native child host window and passes its HWND to mpv using `--wid`. On Linux/X11, it passes the X11 window ID. The renderer reports the video-stage rectangle to Electron so the native host can track the player layout.

mpv documents `--wid` as a native-window embedding mechanism for Win32 and X11. Linux Wayland does not provide the same foreign-window parenting model, so this prototype deliberately falls back to a separate mpv window there.

On macOS, mpv's Cocoa `wid` expects an in-process `NSView*`; passing a foreign-process window handle to the mpv CLI is not supported. A proper embedded macOS implementation needs libmpv's in-process render API and a native Metal/OpenGL view. OnePlay currently uses the separate-window fallback on macOS rather than pretending embedding is complete.

The mpv IPC endpoint is local-only. Do not expose it over a network: the protocol is intentionally unauthenticated and can execute commands.

## Roadmap

0. Cut a release: bump `version` in package.json and push to main; CI builds Windows, macOS and Linux installers and publishes them to a GitHub Release `v<version>`.
1. Validate and harden native video embedding on Windows and Linux/X11.
2. Implement in-process libmpv rendering for macOS and evaluate a Wayland-native path.
3. Bundle or reliably locate mpv per platform and provide first-run diagnostics.
4. Add media library scanning, playlists, resume position, and history using SQLite.
5. Add subtitles, audio/subtitle track selection, playback speed, keyboard shortcuts, and fullscreen.
6. Add hardware-acceleration controls, network streams, and robust error reporting.
7. Add automated tests, accessibility, signed installers, and release automation.

## Licensing

OnePlay's own source code is MIT-licensed. mpv and FFmpeg are separate third-party projects with their own licenses and build configurations. Before bundling or redistributing their binaries, include the applicable license texts and notices and review the exact FFmpeg build's LGPL/GPL configuration. Do not assume that the MIT license for OnePlay covers those dependencies.
