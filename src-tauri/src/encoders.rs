use std::process::Stdio;
use std::sync::OnceLock;

use crate::paths::{hidden_command, tool_path};

/// GPU H.264 encoders in order of preference.
const GPU_ENCODERS: &[&str] = &["h264_nvenc", "h264_amf", "h264_qsv"];

pub fn encoder_test_args(encoder: &str) -> Vec<String> {
    ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-c:v", encoder, "-f", "null", "-"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// GPU encoders that actually work on this machine (compiled into FFmpeg AND backed by hardware).
/// Runs a tiny test encode for each, once per app run.
pub fn detect_encoders() -> Vec<String> {
    static FOUND: OnceLock<Vec<String>> = OnceLock::new();
    FOUND
        .get_or_init(|| {
            let Ok(ffmpeg) = tool_path("ffmpeg") else { return Vec::new() };
            GPU_ENCODERS
                .iter()
                .filter(|enc| {
                    hidden_command(&ffmpeg)
                        .args(encoder_test_args(enc))
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .status()
                        .is_ok_and(|s| s.success())
                })
                .map(|s| s.to_string())
                .collect()
        })
        .clone()
}

pub fn pick_encoder(available: &[String], force_cpu: bool) -> String {
    match available.first() {
        Some(enc) if !force_cpu => enc.clone(),
        _ => "libx264".to_owned(),
    }
}
