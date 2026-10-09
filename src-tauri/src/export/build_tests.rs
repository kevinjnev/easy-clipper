use super::build::*;
use super::model::*;

fn media(id: &str, secs: f64) -> ExportMedia {
    ExportMedia {
        id: id.into(),
        path: format!("C:/clips/{id}.mp4"),
        has_video: true,
        has_audio: true,
        width: 1920,
        height: 1080,
        duration_us: (secs * 1e6) as i64,
        video_codec: Some("h264".into()),
        audio_codec: Some("aac".into()),
        format_name: "mov,mp4,m4a,3gp,3g2,mj2".into(),
    }
}

fn clip(media_id: &str, track: &str, start: f64, inp: f64, out: f64) -> ExportClip {
    ExportClip {
        media_id: media_id.into(),
        track: track.into(),
        start_us: (start * 1e6) as i64,
        in_us: (inp * 1e6) as i64,
        out_us: (out * 1e6) as i64,
    }
}

fn pair(media_id: &str, start: f64, inp: f64, out: f64) -> Vec<ExportClip> {
    vec![clip(media_id, "video", start, inp, out), clip(media_id, "audio", start, inp, out)]
}

fn project(media: Vec<ExportMedia>, clips: Vec<ExportClip>) -> ExportProject {
    ExportProject { fps_num: 30, fps_den: 1, width: 1920, height: 1080, media, clips }
}

fn settings(format: Format) -> ExportSettings {
    ExportSettings {
        format,
        width: None,
        allow_upscale: false,
        quality: Quality::Medium,
        fps: None,
        gif_fps: 15,
        encoder: "libx264".into(),
        out_path: "C:/out/result.mp4".into(),
    }
}

fn joined(cmd: &BuiltCommand) -> String {
    cmd.args.join(" ")
}

#[test]
fn output_size_keeps_aspect_and_even_dims() {
    assert_eq!(output_size(1920, 1080, Some(1280), false), (1280, 720));
    assert_eq!(output_size(641, 361, None, false), (640, 360));
    assert_eq!(output_size(1080, 1920, Some(720), false), (720, 1280));
    assert_eq!(output_size(640, 360, Some(1920), false), (640, 360));
    assert_eq!(output_size(640, 360, Some(1920), true), (1920, 1080));
}

#[test]
fn segments_fill_gaps_to_total() {
    let a = clip("A", "video", 0.0, 0.0, 2.0);
    let b = clip("A", "video", 3.0, 0.0, 1.0);
    let segs = track_segments(&[&a, &b], 5_000_000);
    assert_eq!(
        segs,
        vec![
            Segment::Clip { clip: 0, len_us: 2_000_000 },
            Segment::Gap { len_us: 1_000_000 },
            Segment::Clip { clip: 1, len_us: 1_000_000 },
            Segment::Gap { len_us: 1_000_000 },
        ]
    );
}

#[test]
fn empty_track_is_one_gap() {
    assert_eq!(track_segments(&[], 4_000_000), vec![Segment::Gap { len_us: 4_000_000 }]);
}

#[test]
fn two_clip_mp4() {
    let mut clips = pair("A", 0.0, 0.0, 5.0);
    clips.extend(pair("B", 5.0, 1.0, 3.0));
    let cmd = build_export(&project(vec![media("A", 5.0), media("B", 5.0)], clips), &settings(Format::Mp4)).unwrap();
    let s = joined(&cmd);
    assert_eq!(cmd.total_us, 7_000_000);
    assert!(s.starts_with("-hide_banner -y -nostats -progress pipe:1"));
    assert!(s.contains("-ss 1.000000 -t 2.000000 -i C:/clips/B.mp4"));
    assert_eq!(cmd.args.iter().filter(|a| *a == "-ss").count(), 4);
    assert!(s.contains("concat=n=2:v=1:a=0[vout]"));
    assert!(s.contains("concat=n=2:v=0:a=1[aout]"));
    assert!(s.contains("-crf 23"));
    assert!(s.contains("-c:a aac"));
    assert_eq!(cmd.args.last().unwrap(), "C:/out/result.mp4");
}

#[test]
fn mp4_without_audio_clips_has_no_audio() {
    let clips = vec![clip("A", "video", 0.0, 0.0, 2.0)];
    let cmd = build_export(&project(vec![media("A", 5.0)], clips), &settings(Format::Mp4)).unwrap();
    assert!(cmd.args.contains(&"-an".to_string()));
    assert!(!joined(&cmd).contains("[aout]"));
}

#[test]
fn audio_only_timeline_to_mp4_makes_black_video() {
    let clips = vec![clip("A", "audio", 0.0, 0.0, 2.0)];
    let s = joined(&build_export(&project(vec![media("A", 5.0)], clips), &settings(Format::Mp4)).unwrap());
    assert!(s.contains("color=c=black:s=1920x1080:r=30/1"));
}

#[test]
fn gpu_encoder_quality_args() {
    let mut set = settings(Format::Mp4);
    set.encoder = "h264_amf".into();
    set.quality = Quality::High;
    let s = joined(&build_export(&project(vec![media("A", 5.0)], pair("A", 0.0, 1.0, 2.0)), &set).unwrap());
    assert!(s.contains("-c:v h264_amf -rc cqp -qp_i 18 -qp_p 18"));
    set.encoder = "h264_nvenc".into();
    set.quality = Quality::Small;
    let s = joined(&build_export(&project(vec![media("A", 5.0)], pair("A", 0.0, 1.0, 2.0)), &set).unwrap());
    assert!(s.contains("-c:v h264_nvenc -preset p5 -rc vbr -cq 31 -b:v 0"));
}

#[test]
fn gif_uses_palette_and_no_audio() {
    let mut set = settings(Format::Gif);
    set.width = Some(480);
    let cmd = build_export(&project(vec![media("A", 5.0)], pair("A", 0.0, 0.0, 2.0)), &set).unwrap();
    let s = joined(&cmd);
    assert!(s.contains("palettegen"));
    assert!(s.contains("paletteuse"));
    assert!(s.contains("scale=480:270"));
    assert!(!s.contains("-c:a"));
    assert!(!s.contains("anullsrc"));
    assert_eq!(cmd.args.iter().filter(|a| *a == "-ss").count(), 1);
}

#[test]
fn mp3_is_audio_only() {
    let s = joined(&build_export(&project(vec![media("A", 5.0)], pair("A", 0.0, 0.0, 2.0)), &settings(Format::Mp3)).unwrap());
    assert!(s.contains("libmp3lame"));
    assert!(!s.contains(":v=1"));
    assert!(!s.contains("-c:v"));
}

#[test]
fn audio_formats_need_audio() {
    let clips = vec![clip("A", "video", 0.0, 0.0, 2.0)];
    let err = build_export(&project(vec![media("A", 5.0)], clips), &settings(Format::Wav)).unwrap_err();
    assert_eq!(err.message, "No audio on the timeline");
}

#[test]
fn fast_copy_for_single_untrimmed_mp4() {
    let p = project(vec![media("A", 5.0)], pair("A", 0.0, 0.0, 5.0));
    let set = settings(Format::Mp4);
    assert!(can_fast_copy(&p, &set));
    let s = joined(&build_export(&p, &set).unwrap());
    assert!(s.contains("-c copy"));
}

#[test]
fn no_fast_copy_when_trimmed_or_resized() {
    let trimmed = project(vec![media("A", 5.0)], pair("A", 0.0, 1.0, 5.0));
    assert!(!can_fast_copy(&trimmed, &settings(Format::Mp4)));
    let full = project(vec![media("A", 5.0)], pair("A", 0.0, 0.0, 5.0));
    let mut set = settings(Format::Mp4);
    set.width = Some(1280);
    assert!(!can_fast_copy(&full, &set));
    let video_only = project(vec![media("A", 5.0)], vec![clip("A", "video", 0.0, 0.0, 5.0)]);
    assert!(!can_fast_copy(&video_only, &settings(Format::Mp4)), "audio was removed, so copying would add it back");
}

#[test]
fn empty_timeline_is_an_error() {
    let err = build_export(&project(vec![], vec![]), &settings(Format::Mp4)).unwrap_err();
    assert_eq!(err.message, "Timeline is empty");
}

/// The exact payload shape the UI sends (captured from the dev harness).
#[test]
fn deserializes_ui_payload() {
    let project: ExportProject = serde_json::from_str(r#"{"fpsNum":30,"fpsDen":1,"width":1280,"height":720,
        "media":[{"id":"e7","path":"/dev-media/beach.mp4","hasVideo":true,"hasAudio":true,"width":1280,"height":720,
          "durationUs":8000000,"videoCodec":"h264","audioCodec":"aac","formatName":"mov,mp4,m4a,3gp,3g2,mj2"},
          {"id":"15","path":"/dev-media/music.mp3","hasVideo":false,"hasAudio":true,"width":0,"height":0,
          "durationUs":10031020,"videoCodec":null,"audioCodec":"mp3","formatName":"mp3"}],
        "clips":[{"mediaId":"e7","track":"video","startUs":0,"inUs":0,"outUs":8000000},
          {"mediaId":"e7","track":"audio","startUs":0,"inUs":0,"outUs":8000000}]}"#).unwrap();
    let settings: ExportSettings = serde_json::from_str(r#"{"format":"mp4","width":1280,"allowUpscale":false,
        "quality":"medium","fps":null,"gifFps":15,"encoder":"h264_amf","outPath":"C:/out/export.mp4"}"#).unwrap();
    assert_eq!(project.clips.len(), 2);
    assert_eq!(settings.width, Some(1280));
    assert_eq!(settings.format, Format::Mp4);
    assert!(build_export(&project, &settings).is_ok());
}
