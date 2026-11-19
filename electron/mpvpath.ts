import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { app } from "electron";

/** The mpv to run: the copy shipped in the installer when present, otherwise the system one. */
export function mpvCommand(): string {
  const bundled = path.join(process.resourcesPath, "mpv", process.platform === "win32" ? "mpv.exe" : "mpv");
  return app.isPackaged && fs.existsSync(bundled) ? bundled : "mpv";
}
/** Apps started from Finder or the desktop do not inherit the shell PATH, so add the usual mpv folders. */
export function mpvEnv(): NodeJS.ProcessEnv {
  const home = os.homedir();
  const extra = process.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]
    : process.platform === "linux" ? ["/usr/local/bin", "/usr/bin", "/snap/bin", "/var/lib/flatpak/exports/bin"]
    : [path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "Microsoft", "WinGet", "Links"), path.join(home, "scoop", "shims"), path.join(process.env.ProgramFiles ?? "C:\\Program Files", "mpv"), "C:\\ProgramData\\chocolatey\\bin"];
  return { ...process.env, PATH: [process.env.PATH, ...extra].filter(Boolean).join(path.delimiter) };
}
