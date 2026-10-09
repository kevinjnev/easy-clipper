use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::media::cache::cache_file;
use crate::paths::{hidden_command, tool_path};

const COUNT: u32 = 10;
const WIDTH: u32 = 160;

/// A 10×1 strip of 160 px wide frames taken at even intervals. Cached.
pub fn thumbnails(path: &Path, duration_us: i64) -> AppResult<PathBuf> {
    let out = cache_file(path, "-thumbs.jpg")?;
    if out.is_file() {
        return Ok(out);
    }
    let secs = (duration_us as f64 / 1e6).max(0.1);
    // Slightly faster than COUNT/secs so the strip fills before the file ends.
    let rate = COUNT as f64 * 1.05 / secs;
    let tmp = out.with_extension("tmp.jpg");
    let result = hidden_command(&tool_path("ffmpeg")?)
        .args(["-v", "error", "-y", "-i"])
        .arg(path)
        .args(["-an", "-vf"])
        .arg(format!("fps={rate:.6},scale={WIDTH}:-2,tile={COUNT}x1"))
        .args(["-frames:v", "1", "-q:v", "5"])
        .arg(&tmp)
        .output()?;
    if !result.status.success() || !tmp.is_file() {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::new(format!(
            "Could not make thumbnails: {}",
            String::from_utf8_lossy(&result.stderr).trim()
        )));
    }
    std::fs::rename(&tmp, &out)?;
    Ok(out)
}
