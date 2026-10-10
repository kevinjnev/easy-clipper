use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

use crate::error::{AppError, AppResult};

pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn is_writable(dir: &Path) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(".write-test");
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// `<exe dir>/data` when writable (portable mode), else `%LOCALAPPDATA%\SimpleClipper`.
pub fn data_dir() -> PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let portable = exe_dir().join("data");
        if is_writable(&portable) {
            return portable;
        }
        let local = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir)
            .join("SimpleClipper");
        let _ = std::fs::create_dir_all(&local);
        local
    })
    .clone()
}

/// Creates (if needed) and returns a subdirectory of the data dir.
pub fn data_subdir(name: &str) -> AppResult<PathBuf> {
    let dir = data_dir().join(name);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Finds `ffmpeg` / `ffprobe`: next to the exe first, then on PATH.
pub fn tool_path(name: &str) -> AppResult<PathBuf> {
    let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    let bundled = exe_dir().join(&file);
    if bundled.is_file() {
        return Ok(bundled);
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(&file);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    Err(AppError::new(format!(
        "{file} was not found. Put ffmpeg.exe and ffprobe.exe in the same folder as SimpleClipper.exe."
    )))
}

/// A command that doesn't flash a console window on Windows.
pub fn hidden_command(program: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
