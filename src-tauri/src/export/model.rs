//! What the UI sends to export: a flattened timeline and the chosen settings.

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMedia {
    pub id: String,
    pub path: String,
    pub has_video: bool,
    pub has_audio: bool,
    pub width: u32,
    pub height: u32,
    pub duration_us: i64,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub format_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportClip {
    pub media_id: String,
    /// "video" or "audio"
    pub track: String,
    pub start_us: i64,
    pub in_us: i64,
    pub out_us: i64,
}

impl ExportClip {
    pub fn len_us(&self) -> i64 {
        self.out_us - self.in_us
    }

    pub fn end_us(&self) -> i64 {
        self.start_us + self.len_us()
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProject {
    pub fps_num: u32,
    pub fps_den: u32,
    pub width: u32,
    pub height: u32,
    pub media: Vec<ExportMedia>,
    pub clips: Vec<ExportClip>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Mp4,
    Gif,
    Mp3,
    Wav,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    High,
    Medium,
    Small,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub format: Format,
    /// Output width; None keeps the project size.
    pub width: Option<u32>,
    pub allow_upscale: bool,
    pub quality: Quality,
    /// Output frame rate; None keeps the project rate.
    pub fps: Option<u32>,
    pub gif_fps: u32,
    /// "libx264", "h264_nvenc", "h264_amf" or "h264_qsv".
    pub encoder: String,
    pub out_path: String,
}
