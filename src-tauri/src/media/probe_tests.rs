use super::*;

const AV: &str = include_str!("../../tests/fixtures/probe_av.json");
const V: &str = include_str!("../../tests/fixtures/probe_v.json");

#[test]
fn probe_parses_video_with_audio() {
    let info = parse_probe_json(AV).unwrap();
    assert!(info.has_video && info.has_audio);
    assert_eq!(info.video_codec.as_deref(), Some("h264"));
    assert_eq!(info.audio_codec.as_deref(), Some("aac"));
    assert_eq!((info.width, info.height), (320, 240));
    assert_eq!((info.fps_num, info.fps_den), (30, 1));
    assert!((info.duration_us - 2_000_000).abs() <= 33_334);
    assert!(info.format_name.contains("mp4"));
}

#[test]
fn probe_parses_video_without_audio() {
    let info = parse_probe_json(V).unwrap();
    assert!(info.has_video);
    assert!(!info.has_audio);
    assert_eq!(info.audio_codec, None);
}

#[test]
fn probe_falls_back_to_r_frame_rate() {
    let json = r#"{"streams":[{"codec_type":"video","codec_name":"h264","width":640,"height":360,
        "avg_frame_rate":"0/0","r_frame_rate":"30000/1001"}],"format":{"format_name":"matroska,webm","duration":"5.5"}}"#;
    let info = parse_probe_json(json).unwrap();
    assert_eq!((info.fps_num, info.fps_den), (30000, 1001));
    assert_eq!(info.duration_us, 5_500_000);
}

#[test]
fn probe_ignores_cover_art() {
    let json = r#"{"streams":[
        {"codec_type":"audio","codec_name":"mp3"},
        {"codec_type":"video","codec_name":"mjpeg","width":500,"height":500,"avg_frame_rate":"0/0","r_frame_rate":"90000/1","disposition":{"attached_pic":1}}],
        "format":{"format_name":"mp3","duration":"3.0"}}"#;
    let info = parse_probe_json(json).unwrap();
    assert!(!info.has_video);
    assert!(info.has_audio);
}

#[test]
fn probe_rejects_files_without_streams() {
    let json = r#"{"streams":[],"format":{"format_name":"txt","duration":"1"}}"#;
    assert!(parse_probe_json(json).is_err());
}
