//! Tauri commands called from the UI. Slow work runs on blocking threads.

use std::path::PathBuf;

use crate::error::{AppError, AppResult};
use tauri::Emitter;

use crate::encoders;
use crate::export::build::build_export;
use crate::export::model::{ExportProject, ExportSettings};
use crate::export::run::{run_export, ExportHandle};
use crate::media::probe::{self, MediaInfo};
use crate::media::{proxy, thumbs, waveform};
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

#[tauri::command]
pub async fn get_thumbnails(path: String, duration_us: i64) -> AppResult<String> {
    blocking(move || Ok(thumbs::thumbnails(&PathBuf::from(path), duration_us)?.display().to_string())).await
}

#[tauri::command]
pub async fn get_waveform(path: String) -> AppResult<Vec<f32>> {
    blocking(move || waveform::waveform(&PathBuf::from(path))).await
}

/// Path of a playable preview copy, or None when the original plays fine.
#[tauri::command]
pub async fn ensure_proxy(path: String) -> AppResult<Option<String>> {
    blocking(move || {
        let path = PathBuf::from(path);
        let info = probe::probe(&path)?;
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !proxy::needs_proxy(&info, ext) {
            return Ok(None);
        }
        Ok(Some(proxy::make_proxy(&path, &info)?.display().to_string()))
    })
    .await
}

#[tauri::command]
pub async fn list_encoders() -> AppResult<Vec<String>> {
    blocking(|| Ok(encoders::detect_encoders())).await
}

#[derive(Clone, serde::Serialize)]
struct ExportProgress {
    fraction: f64,
}

/// Runs an export, emitting `export-progress` events. Resolves when FFmpeg finishes.
#[tauri::command]
pub async fn start_export(
    app: tauri::AppHandle,
    handle: tauri::State<'_, ExportHandle>,
    project: ExportProject,
    settings: ExportSettings,
) -> AppResult<()> {
    let handle = handle.inner().clone();
    blocking(move || {
        let cmd = build_export(&project, &settings)?;
        let out = PathBuf::from(&settings.out_path);
        run_export(cmd, &out, |fraction| { let _ = app.emit("export-progress", ExportProgress { fraction }); }, &handle)
    })
    .await
}

#[tauri::command]
pub fn cancel_export(handle: tauri::State<'_, ExportHandle>) {
    handle.cancel();
}

#[tauri::command]
pub async fn read_text(path: String) -> AppResult<String> {
    Ok(std::fs::read_to_string(path)?)
}

#[tauri::command]
pub async fn write_text(path: String, text: String) -> AppResult<()> {
    Ok(std::fs::write(path, text)?)
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}
