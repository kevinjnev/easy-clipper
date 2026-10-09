use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::error::{AppError, AppResult};
use crate::export::build::BuiltCommand;
use crate::logs::new_log;
use crate::paths::{hidden_command, tool_path};

/// "out_time_us=123" → Some(123). Negative values (seen at the very start) clamp to 0.
pub fn parse_progress_line(line: &str) -> Option<i64> {
    line.trim().strip_prefix("out_time_us=")?.parse::<i64>().ok().map(|us| us.max(0))
}

/// Lets another thread cancel a running export.
#[derive(Clone, Default)]
pub struct ExportHandle {
    child: Arc<Mutex<Option<Child>>>,
    cancelled: Arc<AtomicBool>,
}

impl ExportHandle {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Ok(mut guard) = self.child.try_lock() {
            if let Some(child) = guard.as_mut() {
                let _ = child.kill();
            }
        }
    }
}

fn last_lines(path: &Path, n: usize) -> String {
    let text = std::fs::read_to_string(path).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Runs the export, reporting progress (0..1). On cancel or failure the partial output is deleted.
pub fn run_export(cmd: BuiltCommand, out_path: &Path, on_progress: impl Fn(f64), handle: &ExportHandle) -> AppResult<()> {
    handle.cancelled.store(false, Ordering::SeqCst);
    let (log_path, mut log) = new_log("export")?;
    writeln!(log, "ffmpeg {}\n", cmd.args.join(" "))?;

    let mut child = hidden_command(&tool_path("ffmpeg")?)
        .args(&cmd.args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log))
        .spawn()?;
    let stdout = child.stdout.take().ok_or_else(|| AppError::new("Could not read FFmpeg output"))?;
    *handle.child.lock().unwrap() = Some(child);

    let total = cmd.total_us.max(1) as f64;
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if handle.cancelled.load(Ordering::SeqCst) {
            break;
        }
        if let Some(us) = parse_progress_line(&line) {
            on_progress((us as f64 / total).min(1.0));
        }
    }

    let mut child = handle.child.lock().unwrap().take().expect("child stored above");
    if handle.cancelled.load(Ordering::SeqCst) {
        let _ = child.kill();
    }
    let status = child.wait()?;

    if handle.cancelled.load(Ordering::SeqCst) {
        let _ = std::fs::remove_file(out_path);
        return Err(AppError::new("Export cancelled"));
    }
    if !status.success() {
        let _ = std::fs::remove_file(out_path);
        return Err(AppError::new(format!(
            "FFmpeg failed:\n{}\n\nFull log: {}",
            last_lines(&log_path, 15),
            log_path.display()
        )));
    }
    on_progress(1.0);
    Ok(())
}
