<p align="center">
  <img src="src-tauri/app-icon.png" alt="Easy Clipper logo" width="112">
</p>

<h1 align="center">Easy Clipper</h1>

<p align="center">A fast, portable video clip editor for Windows.</p>

---

I built Easy Clipper because I was tired of waiting on Clipchamp every time I wanted to cut a clip.
Most of the time I just want to trim something, maybe stitch a couple of clips together, and export
an MP4 or a GIF. Easy Clipper does exactly that, and it opens instantly.

It's a single portable folder: unzip it and run it. No installer, no account, no admin rights.

## Features

- **Timeline editing.** Separate video and audio tracks, linked by default. Unlink them to move or
  trim audio on its own, and link any video and audio clip back together with `Ctrl+L`.
- **Frame-accurate trimming.** Drag a clip's edge, or select an edge and nudge it one frame at a time
  with the arrow keys.
- **Split, delete and move.** Clips land exactly where you drop them, gaps included. Drop a clip onto
  another one and it slots into the nearest gap, pushing only what's in the way. Edges snap when
  you drag within a few frames of another clip or the playhead.
- **Right-click menu** on the timeline for splitting, deleting and linking.
- **Smooth preview.** Zoom in on the preview to check details. Very large, high-frame-rate or
  high-bitrate files get a lightweight preview copy automatically, so playback stays smooth.
- **Export** to MP4, GIF, MP3 or WAV at source, 1080p, 720p, 480p or a custom size. MP4 exports use
  your GPU (NVIDIA, AMD or Intel) when one is available.
- **Non-destructive.** Your original files are never touched, and nothing is re-encoded until you export.

## Getting started

1. Download the latest `EasyClipper-<version>-win-x64.zip` from
   [Releases](https://github.com/kevinjnev/easy-clipper/releases), or build it yourself (see below).
2. Unzip it anywhere. A USB stick works too.
3. Run `EasyClipper.exe`.

Easy Clipper runs on Windows 10 and 11 and uses the Microsoft Edge WebView2 runtime, which comes
with Windows 11 and current versions of Windows 10. Its cache and logs live in a `data` folder next
to the exe, or in `%LOCALAPPDATA%\EasyClipper` if that folder isn't writable.

## How to use it

1. **Import** your clips with the Import button, or drag files onto the window.
2. **Add them to the timeline.** Double-click a clip in the media bin (or select it and press
   `Enter`) to add it to the end, or drag it to exactly where you want it.
3. **Edit.** Drag clip edges to trim, press `S` to split at the playhead, and `Delete` to remove
   clips. Right-click a clip for more options.
4. **Export** with `Ctrl+E` and choose a format and size.

Projects save as `.clipproj` files. If you move your media around, Easy Clipper asks you to find the
missing files when you open the project, and picks up any others in the same folder automatically.

### Keyboard shortcuts

Press `?` in the app to show or hide the shortcuts panel.

| Keys | Action |
|---|---|
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame, or nudge the selected clip edge one frame |
| `Shift+←` / `Shift+→` | Jump 10 frames |
| `[` / `]` | Select the left / right edge of a clip |
| `Home` / `End` | Go to the start / last frame of the selected clips (or the whole timeline) |
| `S` | Split at the playhead |
| `Delete` | Delete selected clips |
| `Ctrl+L` | Link / unlink video and audio |
| `Enter` | Add the selected media to the end of the timeline |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+S` / `Ctrl+O` | Save / open a project |
| `Ctrl+E` | Export |
| `Ctrl+Scroll` | Zoom the timeline or the preview, whichever is under the cursor |
| `Scroll` | Scroll the timeline |
| `Ctrl+drag` on the preview | Look around while zoomed in |
| `Alt` while dragging | Turn off snapping |

## Building from source

You'll need Node.js 20+, Rust (stable, with the MSVC toolchain and the Visual Studio C++ Build Tools),
and FFmpeg on your `PATH`.

```bash
npm install
npm run tauri dev
```

Run the tests with:

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

The Rust integration tests generate small clips with FFmpeg and run real exports. They're skipped if
FFmpeg isn't installed.

### Making the portable zip

```powershell
.\scripts\fetch-ffmpeg.ps1   # downloads the pinned FFmpeg 7.1.1 build and checks its SHA-256
.\scripts\package.ps1        # builds release\EasyClipper-<version>-win-x64.zip
```

If you change the app icon, run `cargo clean -p easy-clipper --release --manifest-path src-tauri/Cargo.toml`
before packaging so the new icon gets built into the exe.

### Working on the UI in a browser

Run `node scripts/dev-media.mjs` to generate some sample clips, then `npm run dev` and open
http://localhost:1420. In a normal browser, a development-only stand-in replaces the Rust side, so you
can work on the interface without launching the full app.

## Built with

[Tauri](https://tauri.app), [Svelte](https://svelte.dev), Rust and [FFmpeg](https://ffmpeg.org).

## License

Easy Clipper is MIT licensed. See [LICENSE](LICENSE). The release zip includes FFmpeg, which is
GPL licensed; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
