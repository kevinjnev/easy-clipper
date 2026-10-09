use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::media::cache::cache_file;
use crate::paths::{hidden_command, tool_path};

const SAMPLE_RATE: u32 = 8000;
/// 8000 Hz / 100 = 80 peaks per second.
const PER_BUCKET: usize = 100;

/// Peak level (0..1) of each `per_bucket` run of samples; the last bucket may be shorter.
pub fn compute_peaks(samples: &[i16], per_bucket: usize) -> Vec<f32> {
    samples
        .chunks(per_bucket.max(1))
        .map(|chunk| chunk.iter().map(|s| (*s as i32).unsigned_abs()).max().unwrap_or(0) as f32 / 32768.0)
        .collect()
}

/// Waveform peaks at 80 per second. Cached as JSON.
pub fn waveform(path: &Path) -> AppResult<Vec<f32>> {
    let cached = cache_file(path, "-wave.json")?;
    if let Ok(text) = std::fs::read_to_string(&cached) {
        if let Ok(peaks) = serde_json::from_str(&text) {
            return Ok(peaks);
        }
    }
    let out = hidden_command(&tool_path("ffmpeg")?)
        .args(["-v", "error", "-i"])
        .arg(path)
        .args(["-vn", "-ac", "1", "-ar", &SAMPLE_RATE.to_string(), "-f", "s16le", "pipe:1"])
        .output()?;
    if !out.status.success() {
        return Err(AppError::new(format!(
            "Could not read audio: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        )));
    }
    let samples: Vec<i16> = out.stdout.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    let peaks = compute_peaks(&samples, PER_BUCKET);
    std::fs::write(&cached, serde_json::to_string(&peaks)?)?;
    Ok(peaks)
}
