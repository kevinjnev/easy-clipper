#![allow(dead_code)]
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn have_ffmpeg() -> bool {
    let ok = easy_clipper_lib::paths::tool_path("ffmpeg").is_ok() && easy_clipper_lib::paths::tool_path("ffprobe").is_ok();
    if !ok {
        eprintln!("skipping: ffmpeg/ffprobe not found");
    }
    ok
}

/// Generates a test clip (testsrc2 video, optional 440 Hz sine audio) with H.264/AAC.
pub fn make_clip(dir: &Path, name: &str, secs: f64, w: u32, h: u32, fps: u32, audio: bool) -> PathBuf {
    let out = dir.join(name);
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-v", "error", "-y", "-f", "lavfi", "-i"])
        .arg(format!("testsrc2=size={w}x{h}:rate={fps}:duration={secs}"));
    if audio {
        cmd.args(["-f", "lavfi", "-i"]).arg(format!("sine=frequency=440:duration={secs}"));
    }
    // Odd sizes can't use 4:2:0 chroma subsampling.
    let pix_fmt = if w % 2 == 1 || h % 2 == 1 { "yuv444p" } else { "yuv420p" };
    cmd.args(["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", pix_fmt]);
    if audio {
        cmd.args(["-c:a", "aac"]);
    }
    let status = cmd.arg(&out).status().expect("run ffmpeg");
    assert!(status.success(), "fixture generation failed");
    out
}

/// ffprobe a single entry, e.g. ("v:0", "stream=width").
pub fn probe_entry(path: &Path, stream: &str, entry: &str) -> String {
    let out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", stream, "-show_entries", entry, "-of", "csv=p=0"])
        .arg(path)
        .output()
        .expect("run ffprobe");
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
}
