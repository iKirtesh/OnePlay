<div align="center">

<img src="build/icon.png" width="112" alt="OnePlay logo" />

# OnePlay

**One player for every screen.**<br/>
A fast, modern media player for Windows, macOS, Ubuntu, Android and iPhone.

[![Build](https://github.com/iKirtesh/OnePlay/actions/workflows/build.yml/badge.svg)](https://github.com/iKirtesh/OnePlay/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/iKirtesh/OnePlay?label=desktop&color=0A84FF)](https://github.com/iKirtesh/OnePlay/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](#license)

[**Download**](#download) · [Features](#features) · [Mobile](#mobile) · [Build from source](#build-from-source) · [Roadmap](#roadmap)

</div>

---

## Features

### Desktop (Windows · macOS · Ubuntu)

| | |
| --- | --- |
| **Plays everything** | MP4, MKV, AVI, MOV, WebM, MP3, FLAC and more, powered by mpv and FFmpeg |
| **Apple-style interface** | Clean light and dark themes that follow your system |
| **Queue and history** | Drag and drop files, auto-advance, recent files, resume where you stopped |
| **Subtitles and tracks** | Load `.srt` / `.ass` / `.vtt`, switch subtitle and audio tracks, chapter picker |
| **Precision tools** | Speed 0.5x to 2x, A-B repeat, frame stepping, screenshots to your Pictures folder |
| **Mini player** | Keep the window on top of everything else |
| **Seek-bar previews** | Hover the timeline to see a thumbnail of that moment |
| **Music mode** | Album art, track details and shuffle for audio files |
| **Favorites and playlists** | Heart a video or build playlists, synced with your phone |
| **Subtitle search** | Find and download subtitles from OpenSubtitles (needs a free account and API key) |
| **Update notice** | Tells you when a newer version is released |
| **Wi-Fi sharing** | Share folders with your phone on the same network, with synced resume points |

**Shortcuts**

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `Space` / `K` | Play / pause | `S` | Cycle subtitles |
| `←` `→` | Seek 5 s (`Shift` = 30 s) | `A` | Cycle audio track |
| `↑` `↓` | Volume | `B` | A-B repeat |
| `M` | Mute | `.` `,` | Next / previous frame |
| `F` | Fullscreen | `C` | Screenshot |
| `N` / `P` | Next / previous | `L` | Repeat |

### Mobile (Android · iPhone)

- **Scans your whole device** for videos and music and groups them by folder, with all files listed below. The last scan is cached, so the library opens instantly.
- **VLC-style player gestures:** swipe to seek, swipe the left side for brightness and the right side for volume, double-tap to skip 10 s.
- **Controls:** speed 0.25x to 3x, audio tracks, subtitles (including external `.srt` / `.vtt`), aspect modes, A-B repeat, frame step, sleep timer, screen lock, auto-rotate, picture-in-picture and background audio.
- **Library tools:** search, favorites, sort, hide folders, continue-watching row and resume positions.
- **Remote control:** play, pause, seek and change volume on your computer from the phone, updated live, or send a video to the computer to play.
- **Watch together:** the phone plays the same video as the computer and stays in step. Pause, seek or change speed on either device and the other follows.
- **Favorites and playlists** sync with the computer, matched by file name.
- **My computer:** browse and stream the folders you share from desktop OnePlay over Wi-Fi, and continue where you left off on the other device.
- **Network streams:** paste an `https://` link (including `.m3u8`).
- **VLC engine fallback** for files the native player can't open (MKV with DTS, HEVC and similar).
- **In-app update notice** when a newer build is released.

## Download

Get the latest builds from the **[Releases page](https://github.com/iKirtesh/OnePlay/releases)**.

| System | File | Notes |
| --- | --- | --- |
| **Windows 10/11** | `OnePlay-<version>-win-x64-setup.exe` or the portable `.exe` | See [signing](#unsigned-builds) |
| **macOS** (Apple Silicon + Intel) | `OnePlay-<version>-mac-universal.dmg` | See [signing](#unsigned-builds) |
| **Ubuntu / Debian** | `OnePlay-<version>-linux-amd64.deb` or `.AppImage` | `sudo apt install ./OnePlay-*.deb` also installs mpv |
| **Android 8+** | `OnePlay-Mobile-android.apk` | Installs over the previous version |
| **iPhone / iPad** | `OnePlay-Mobile-ios-unsigned.ipa` | Sideload with AltStore or Sideloadly |

> **Install mpv first** on desktop (OnePlay does not bundle it yet):
> Windows `winget install mpv` · macOS `brew install mpv` · Ubuntu `sudo apt install mpv`

### Unsigned builds

OnePlay is not code-signed yet, so your system may warn about it:

| System | What you see | What to do |
| --- | --- | --- |
| **Windows** | SmartScreen warning | Choose *More info → Run anyway* |
| **Windows with Smart App Control on** | The app is blocked outright | Run from source (below), or wait for a signed build |
| **macOS** | "Cannot be opened" | Right-click the app and choose *Open*, or run `xattr -cr /Applications/OnePlay.app` |
| **Linux** | Nothing | AppImage needs `chmod +x` |

The release workflow signs Windows and macOS builds automatically once signing secrets are added (see [Releasing](#releasing)).

## Mobile

The phone app lives in [`mobile/`](mobile) and is built with Expo and React Native. It uses the native system player and can hand a file to a VLC engine when needed.

- iOS can only read the Photos library, so folder browsing there is limited.
- Android library scanning covers media that Android has indexed. Folders containing a `.nomedia` file aren't included.
- The iOS build is unsigned; free Apple IDs let sideloaded apps run for 7 days.
- Not yet tested on physical devices. Please report issues.

## Build from source

Requirements: Node.js 22+, npm, and [mpv](https://mpv.io) on your `PATH`.

```bash
git clone https://github.com/iKirtesh/OnePlay.git
cd OnePlay
npm install
npm run dev          # desktop app with hot reload
npm run build        # installers into release/
```

Mobile:

```bash
cd mobile
npm install --legacy-peer-deps
npx expo prebuild
npx expo run:android      # or run:ios on a Mac
```

## Wi-Fi sharing

1. On the computer, click the Wi-Fi button in OnePlay, turn sharing on and add your video folders.
2. On the phone, tap the monitor icon, then enter the address and the 6-digit pairing code shown on the computer.
3. Browse and play. Where you stop is synced both ways by file name.

Only devices on private home-network addresses are served, each needs the pairing token, and wrong codes are rate-limited. Traffic is plain HTTP on your local network, so use it on networks you trust. Firewalls may ask to allow OnePlay the first time (port 8765).

## How it works

```
 React + TypeScript UI ──► Electron main process ──► mpv  (JSON IPC, local socket)
                                    │                    └─ FFmpeg decoders
                                    └─ native child window for video (Windows, Linux/X11)
```

- **Video window:** on Windows and macOS the video opens in its own mpv window by default. Windows and Linux/X11 can instead draw it inside the app window (the monitor button in the title bar, experimental); on Windows that child window can end up hidden behind the app's own surface on some setups.
- **Linux/X11 embedding:** mpv draws into a native child window that follows the player area. Linux/Wayland and macOS use a separate mpv window for now, because macOS needs libmpv's in-process render API for true embedding.
- The mpv control socket is local-only and unauthenticated. Never expose it on a network.

## Releasing

Push to `main` and CI does the rest.

- **Desktop:** bump `version` in `package.json`. CI builds Windows, macOS and Linux and publishes `v<version>`.
- **Mobile:** every push to `main` that changes `mobile/` publishes a `mobile-<n>` release with the APK and IPA.
- **Signing (optional):** add repository secrets `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` for Windows, and `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` for macOS.

## Roadmap

- [ ] Code-signed Windows and macOS installers
- [ ] Bundle mpv so nothing needs installing first
- [ ] Embedded video on macOS and Wayland through libmpv
- [x] Browse, stream and resume sync between phone and desktop over your local network (favorites sync still to do)
- [x] Phone as a remote control for the desktop player, with live updates
- [x] Watch together: phone and computer play in step
- [x] Favorites and playlists synced between phone and desktop
- [ ] Subtitle search on the phone
- [ ] Cast to TV and an audio equalizer on mobile
- [ ] Automated tests and accessibility pass

## License

OnePlay's own source is MIT-licensed. mpv, FFmpeg and VLC are separate projects with their own licenses; review them before bundling or redistributing their binaries.
