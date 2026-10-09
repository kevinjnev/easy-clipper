use std::fs::File;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::AppResult;
use crate::paths::data_subdir;

const KEEP: usize = 20;

/// Creates `logs/<millis>-<kind>.log` and deletes all but the newest 20 logs.
pub fn new_log(kind: &str) -> AppResult<(PathBuf, File)> {
    let dir = data_subdir("logs")?;
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("{millis:015}-{kind}.log"));
    let file = File::create(&path)?;

    let mut logs: Vec<PathBuf> = std::fs::read_dir(&dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "log"))
        .collect();
    logs.sort();
    if logs.len() > KEEP {
        for old in &logs[..logs.len() - KEEP] {
            let _ = std::fs::remove_file(old);
        }
    }
    Ok((path, file))
}
