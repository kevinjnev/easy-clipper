## Building from source

You'll need Node.js 20+, Rust (stable and with the MSVC toolchain and Visual Studio C++ Build Tools),
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
.\scripts\package.ps1        # builds release\SimpleClipper-<version>-win-x64.zip
```

If you change the app icon, run `cargo clean -p simple-clipper --release --manifest-path src-tauri/Cargo.toml`
before packaging so the new icon gets built into the exe.

### Working on the UI in a browser

Run `node scripts/dev-media.mjs` to generate some sample clips, then `npm run dev` and open
http://localhost:1420. In a normal browser, a development-only stand-in replaces the Rust side, so you
can work on the interface without launching the full app.

## Built with

[Tauri](https://tauri.app), [Svelte](https://svelte.dev), Rust and [FFmpeg](https://ffmpeg.org).

## License

Simple Clipper is MIT licensed. See [LICENSE](LICENSE). The release zip includes FFmpeg, which is
GPL licensed; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).