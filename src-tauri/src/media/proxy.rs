use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::media::cache::cache_file;
use crate::media::probe::MediaInfo;
use crate::paths::{hidden_command, tool_path};

const VIDEO_EXTS: &[&str] = &["mp4", "m4v", "mov", "webm"];
const VIDEO_CODECS: &[&str] = &["h264", "vp8", "vp9", "av1"];
const AUDIO_CODECS: &[&str] = &["aac", "mp3", "opus", "vorbis"];
const AUDIO_ONLY_EXTS: &[&str] = &["mp3", "m4a", "aac", "wav", "ogg", "opus", "flac"];

/// Whether WebView2 can't play this file directly and needs a preview copy.
pub fn needs_proxy(info: &MediaInfo, ext: &str) -> bool {
    let ext = ext.to_ascii_lowercase();
    let codec_ok = |codec: &Option<String>, allowed: &[&str]| codec.as_deref().is_none_or(|c| allowed.contains(&c));
    if !info.has_video {
        return !AUDIO_ONLY_EXTS.contains(&ext.as_str());
    }
    !(VIDEO_EXTS.contains(&ext.as_str())
        && codec_ok(&info.video_codec, VIDEO_CODECS)
        && codec_ok(&info.audio_codec, AUDIO_CODECS))
}

/// A small, fast-seeking H.264/AAC preview copy (≤540p, keyframe every 15 frames). Cached.
pub fn make_proxy(path: &Path, info: &MediaInfo) -> AppResult<PathBuf> {
    let out = cache_file(path, if info.has_video { "-proxy.mp4" } else { "-proxy.m4a" })?;
    if out.is_file() {
        return Ok(out);
    }
    let tmp = out.with_extension(if info.has_video { "tmp.mp4" } else { "tmp.m4a" });
    let mut cmd = hidden_command(&tool_path("ffmpeg")?);
    cmd.args(["-v", "error", "-y", "-i"]).arg(path);
    if info.has_video {
        cmd.args(["-map", "0:v:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-g", "15"])
            .args(["-pix_fmt", "yuv420p", "-vf", "scale=-2:2*trunc(min(540\\,ih)/2)"]);
    }
    if info.has_audio {
        cmd.args(["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k"]);
    }
    let result = cmd.args(["-movflags", "+faststart"]).arg(&tmp).output()?;
    if !result.status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::new(format!(
            "Could not make a preview copy: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        )));
    }
    std::fs::rename(&tmp, &out)?;
    Ok(out)
}
