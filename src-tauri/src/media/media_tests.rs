use super::probe::MediaInfo;
use super::proxy::needs_proxy;
use super::waveform::compute_peaks;
use crate::encoders::pick_encoder;

fn info(video: Option<&str>, audio: Option<&str>) -> MediaInfo {
    MediaInfo {
        duration_us: 1_000_000,
        has_video: video.is_some(),
        has_audio: audio.is_some(),
        width: 640,
        height: 360,
        fps_num: 30,
        fps_den: 1,
        video_codec: video.map(str::to_owned),
        audio_codec: audio.map(str::to_owned),
        format_name: String::new(),
        bit_rate: None,
    }
}

#[test]
fn peaks_are_max_abs_per_bucket() {
    assert_eq!(compute_peaks(&[0, 16384, -32768, 0], 2), vec![0.5, 1.0]);
    assert_eq!(compute_peaks(&[100; 5], 2).len(), 3);
}

#[test]
fn proxy_rules() {
    assert!(!needs_proxy(&info(Some("h264"), Some("aac")), "mp4"));
    assert!(!needs_proxy(&info(Some("h264"), Some("aac")), "MP4"));
    assert!(needs_proxy(&info(Some("h264"), Some("aac")), "mkv"));
    assert!(needs_proxy(&info(Some("hevc"), Some("aac")), "mp4"));
    assert!(needs_proxy(&info(Some("prores"), Some("pcm_s16le")), "mov"));
    assert!(!needs_proxy(&info(Some("vp9"), Some("opus")), "webm"));
    assert!(!needs_proxy(&info(Some("h264"), None), "mov"));
    assert!(!needs_proxy(&info(None, Some("pcm_s16le")), "wav"));
    assert!(!needs_proxy(&info(None, Some("mp3")), "mp3"));
    assert!(needs_proxy(&info(None, Some("wmav2")), "wma"));
}

#[test]
fn encoder_choice() {
    assert_eq!(pick_encoder(&[], false), "libx264");
    assert_eq!(pick_encoder(&["h264_amf".to_owned()], true), "libx264");
    assert_eq!(pick_encoder(&["h264_amf".to_owned()], false), "h264_amf");
}

#[test]
fn heavy_files_get_a_preview_copy() {
    let mut big = info(Some("h264"), Some("aac"));
    big.width = 2560;
    big.height = 1440;
    assert!(needs_proxy(&big, "mp4"), "1440p");

    let mut tall = info(Some("h264"), Some("aac"));
    tall.width = 1080;
    tall.height = 1920;
    assert!(!needs_proxy(&tall, "mp4"), "portrait 1080p is fine");

    let mut fast = info(Some("h264"), Some("aac"));
    fast.fps_num = 120;
    assert!(needs_proxy(&fast, "mp4"), "120 fps");
    fast.fps_num = 60;
    assert!(!needs_proxy(&fast, "mp4"), "60 fps is fine");
    fast.fps_num = 60000;
    fast.fps_den = 1001;
    assert!(!needs_proxy(&fast, "mp4"), "59.94 fps is fine");

    let mut dense = info(Some("h264"), Some("aac"));
    dense.bit_rate = Some(45_000_000);
    assert!(needs_proxy(&dense, "mp4"), "45 Mbps");
    dense.bit_rate = Some(20_000_000);
    assert!(!needs_proxy(&dense, "mp4"), "20 Mbps is fine");
}
