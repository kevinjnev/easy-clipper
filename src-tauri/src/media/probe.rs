use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::paths::{hidden_command, tool_path};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub duration_us: i64,
    pub has_video: bool,
    pub has_audio: bool,
    pub width: u32,
    pub height: u32,
    pub fps_num: u32,
    pub fps_den: u32,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub format_name: String,
}

/// Parses "30000/1001"; None for "0/0" or garbage.
fn parse_rate(s: Option<&str>) -> Option<(u32, u32)> {
    let (n, d) = s?.split_once('/')?;
    let (n, d) = (n.parse::<u32>().ok()?, d.parse::<u32>().ok()?);
    (n > 0 && d > 0).then_some((n, d))
}

fn parse_secs(v: Option<&Value>) -> Option<i64> {
    let secs: f64 = v?.as_str()?.parse().ok()?;
    Some((secs * 1_000_000.0).round() as i64)
}

pub fn parse_probe_json(json: &str) -> AppResult<MediaInfo> {
    let root: Value = serde_json::from_str(json)?;
    let streams = root["streams"].as_array().cloned().unwrap_or_default();
    let is_cover = |s: &Value| s["disposition"]["attached_pic"].as_i64() == Some(1);
    let video = streams.iter().find(|s| s["codec_type"] == "video" && !is_cover(s));
    let audio = streams.iter().find(|s| s["codec_type"] == "audio");
    if video.is_none() && audio.is_none() {
        return Err(AppError::new("This file has no video or audio that can be read."));
    }

    let (fps_num, fps_den) = video
        .and_then(|v| parse_rate(v["avg_frame_rate"].as_str()).or_else(|| parse_rate(v["r_frame_rate"].as_str())))
        .unwrap_or((30, 1));
    let duration_us = parse_secs(root["format"].get("duration"))
        .or_else(|| video.and_then(|v| parse_secs(v.get("duration"))))
        .or_else(|| audio.and_then(|a| parse_secs(a.get("duration"))))
        .ok_or_else(|| AppError::new("Could not read the file's duration."))?;
    let codec = |s: Option<&Value>| s.and_then(|s| s["codec_name"].as_str()).map(str::to_owned);

    Ok(MediaInfo {
        duration_us,
        has_video: video.is_some(),
        has_audio: audio.is_some(),
        width: video.and_then(|v| v["width"].as_u64()).unwrap_or(0) as u32,
        height: video.and_then(|v| v["height"].as_u64()).unwrap_or(0) as u32,
        fps_num,
        fps_den,
        video_codec: codec(video),
        audio_codec: codec(audio),
        format_name: root["format"]["format_name"].as_str().unwrap_or("").to_owned(),
    })
}

pub fn probe(path: &Path) -> AppResult<MediaInfo> {
    let out = hidden_command(&tool_path("ffprobe")?)
        .args(["-v", "error", "-show_streams", "-show_format", "-of", "json"])
        .arg(path)
        .output()?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(AppError::new(format!("Could not open this file: {}", err.trim())));
    }
    parse_probe_json(&String::from_utf8_lossy(&out.stdout))
}

#[cfg(test)]
#[path = "probe_tests.rs"]
mod tests;
