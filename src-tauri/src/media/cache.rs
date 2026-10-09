use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::error::AppResult;
use crate::paths::data_subdir;

/// Identifies a specific version of a file: path + size + modified time.
pub fn cache_key(path: &Path) -> AppResult<String> {
    let meta = std::fs::metadata(path)?;
    let mtime = meta.modified()?.duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let mut h = DefaultHasher::new();
    path.hash(&mut h);
    meta.len().hash(&mut h);
    mtime.hash(&mut h);
    Ok(format!("{:016x}", h.finish()))
}

/// `<data>/cache/<key><suffix>`, e.g. suffix "-thumbs.jpg".
pub fn cache_file(path: &Path, suffix: &str) -> AppResult<PathBuf> {
    Ok(data_subdir("cache")?.join(format!("{}{suffix}", cache_key(path)?)))
}
