# Easy Clipper

A fast, lightweight, portable video clip editor for Windows. Trim, split and stitch clips on a
timeline, then export to MP4, GIF or audio. Think Clipchamp's basic editing, without the wait.

- **Portable** — unzip and run. No installer, no admin rights. ~8 MB app plus FFmpeg.
- **Separate video and audio tracks** — linked by default, unlink with `Ctrl+L` to edit them independently.
- **Frame-accurate trimming** — drag clip edges, or select an edge and nudge it one frame at a time with the arrow keys.
- **Split, delete, move** — clips go exactly where you drop them (gaps allowed); dropping onto another clip
  inserts it at the nearest gap and pushes later clips along. Edges snap when dragged within a few frames.
- **Preview zoom** — Ctrl+Scroll to zoom the preview, Ctrl+drag to look around.
- **Export** — MP4 (H.264/AAC, GPU-accelerated on NVIDIA/AMD/Intel when available), GIF, MP3, WAV;
  Source / 1080p / 720p / 480p / custom resolution. Nothing is re-encoded until you export, and your
  original files are never modified.

## Download and run

1. Download `EasyClipper-<version>-win-x64.zip` from [Releases](https://github.com/kevinjnev/easy-clipper/releases).
2. Unzip anywhere (a USB stick works too).
3. Run `EasyClipper.exe`.

Requires Windows 10/11 with the Microsoft Edge WebView2 runtime (preinstalled on Windows 11 and current Windows 10).
Cache files and logs are kept in a `data` folder next to the exe (or `%LOCALAPPDATA%\EasyClipper` if that folder isn't writable).

## Using it

1. **Import** media (button or drag files onto the window).
2. Double-click a file in the media bin (or select it and press `Enter`) to add it to the end of the timeline,
   or drag it onto the timeline to insert it between clips.
3. Trim by dragging clip edges, split with `S`, delete with `Delete`, drag clips to move them.
   To link a video and an audio clip, click one, Ctrl+click the other and press `Ctrl+L`.
4. **Export** (`Ctrl+E`) and choose a format and resolution.

Projects save as `.clipproj` files. If media files have moved when you open a project, Easy Clipper asks
you to locate them (and finds others in the same folder automatically).

### Keyboard shortcuts

Press `?` in the app to show or hide the shortcuts panel.

| Keys | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame — or move the selected clip edge by one frame |
| `Shift+←` / `Shift+→` | 10 frames |
| `[` / `]` | Select the left / right edge of the selected clip (or the clip under the playhead) |
| `Home` / `End` | Go to start / end |
| `S` | Split at the playhead (selected clips, or everything under the playhead) |
| `Delete` | Delete selected clips |
| `Ctrl+L` | Link / unlink video and audio |
| `Enter` | Add the selected media to the end |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` / `Ctrl+O` | Save / open project |
| `Ctrl+E` | Export |
| `Ctrl+Scroll` | Zoom the timeline or the preview (whichever is under the cursor) |
| `Scroll` | Scroll the timeline |
| `Ctrl+drag` on the preview | Move around while zoomed in |
| `Alt` while dragging | Disable snapping |

## Building from source

Requirements: Node.js 20+, Rust (stable, MSVC toolchain + Visual Studio C++ Build Tools), FFmpeg on `PATH` for development.

```bash
npm install
npm run tauri dev
```

Tests:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

The Rust integration tests generate small clips with FFmpeg and run real exports (they're skipped if FFmpeg isn't found).

### Packaging the portable zip

```powershell
.\scripts\fetch-ffmpeg.ps1   # downloads the pinned FFmpeg 7.1.1 build and verifies its SHA-256
.\scripts\package.ps1        # builds release\EasyClipper-<version>-win-x64.zip
```

### UI development in a browser

`node scripts/dev-media.mjs` generates sample clips into `static/dev-media/`. Then `npm run dev` and open
http://localhost:1420 in a normal browser: a dev-only harness fakes the Rust side so the UI can be tried
without Tauri. The editor is available as `window.__editor` in the console.

## License

MIT — see [LICENSE](LICENSE). The release zip bundles FFmpeg, which is GPL-licensed; see
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
