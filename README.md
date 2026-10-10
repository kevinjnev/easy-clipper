Easy Clipper is a fast, simple way to cut and merge clips.

## Requirements
1. Windows 11 or 10 with the Microsoft Edge Webview2 runtime installed.

## Features

- Timeline editing: Separate video and audio tracks, linked by default. Unlink them to move or
  trim audio on its own, and link any video and audio clip back together with Ctrl+L.
- Frame-accurate trimming: Drag a clip's edge, or select an edge and nudge it one frame at a time
  with the arrow keys.
- Export: to MP4, GIF, MP3 or WAV at source, 1080p, 720p, 480p or a custom size.

## How To Download

1. Download the latest `EasyClipper-<version>-win-x64.zip` from
   [Releases](https://github.com/kevinjnev/easy-clipper/releases), or build it yourself (see below).
2. Unzip it.
3. Run `EasyClipper.exe`.

## How to use it

1. Import your clips with the Import button, or drag files onto the window.
2. Add them to the timeline and edit.
3. Export with `Ctrl+E` or the button and choose a format and size.

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

## Built with

[Tauri](https://tauri.app), [Svelte](https://svelte.dev), Rust and [FFmpeg](https://ffmpeg.org).

## License

Easy Clipper is MIT licensed. See [LICENSE](LICENSE). The release zip includes FFmpeg, which is
GPL licensed; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).