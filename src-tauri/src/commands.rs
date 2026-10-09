//! Tauri commands called from the UI. Slow work runs on blocking threads.

use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use crate::media::probe::{self, MediaInfo};
use crate::paths::tool_path;

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> AppResult<T> + Send + 'static) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| AppError::new(e.to_string()))?
}

#[tauri::command]
pub async fn probe_media(path: String) -> AppResult<MediaInfo> {
    blocking(move || probe::probe(&PathBuf::from(path))).await
}

/// The ffmpeg path in use, or an error explaining it's missing.
#[tauri::command]
pub fn ffmpeg_status() -> AppResult<String> {
    tool_path("ffprobe")?;
    Ok(tool_path("ffmpeg")?.display().to_string())
}
