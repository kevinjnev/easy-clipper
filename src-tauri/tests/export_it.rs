mod common;

use std::path::{Path, PathBuf};

use easy_clipper_lib::encoders::{detect_encoders, pick_encoder};
use easy_clipper_lib::export::build::build_export;
use easy_clipper_lib::export::model::*;
use easy_clipper_lib::export::run::{run_export, ExportHandle};

const FRAME: f64 = 1.0 / 30.0;

fn media(id: &str, path: &Path, secs: f64, w: u32, h: u32, audio: bool) -> ExportMedia {
    ExportMedia {
        id: id.into(),
        path: path.display().to_string(),
        has_video: true,
        has_audio: audio,
        width: w,
        height: h,
        duration_us: (secs * 1e6) as i64,
        video_codec: Some("h264".into()),
        audio_codec: audio.then(|| "aac".into()),
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

fn project(w: u32, h: u32, media: Vec<ExportMedia>, clips: Vec<ExportClip>) -> ExportProject {
    ExportProject { fps_num: 30, fps_den: 1, width: w, height: h, media, clips }
}

fn settings(format: Format, out: &Path) -> ExportSettings {
    ExportSettings {
        format,
        width: None,
        allow_upscale: false,
        quality: Quality::Small,
        fps: None,
        gif_fps: 10,
        encoder: "libx264".into(),
        out_path: out.display().to_string(),
    }
}

fn export(p: &ExportProject, s: &ExportSettings) -> Result<PathBuf, String> {
    let cmd = build_export(p, s).map_err(|e| e.message)?;
    run_export(cmd, Path::new(&s.out_path), |_| {}, &ExportHandle::default()).map_err(|e| e.message)?;
    Ok(PathBuf::from(&s.out_path))
}

fn stream_secs(path: &Path, stream: &str) -> f64 {
    common::probe_entry(path, stream, "stream=duration").parse().unwrap_or(-1.0)
}

fn assert_close(actual: f64, expected: f64, tol: f64) {
    assert!((actual - expected).abs() <= tol, "expected {expected}s ± {tol}, got {actual}s");
}

#[test]
fn two_clips_mp4() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 2.0, 1920, 1080, 30, true);
    let b = common::make_clip(dir.path(), "b.mp4", 3.0, 1920, 1080, 30, true);
    let mut clips = pair("A", 0.0, 0.0, 2.0);
    clips.extend(pair("B", 2.0, 1.0, 3.0));
    let p = project(1920, 1080, vec![media("A", &a, 2.0, 1920, 1080, true), media("B", &b, 3.0, 1920, 1080, true)], clips);
    let mut s = settings(Format::Mp4, &dir.path().join("out.mp4"));
    s.width = Some(1280);
    let out = export(&p, &s).unwrap();
    assert_close(stream_secs(&out, "v:0"), 4.0, FRAME);
    assert_close(stream_secs(&out, "a:0"), 4.0, 0.05);
    assert_eq!(common::probe_entry(&out, "v:0", "stream=width,height"), "1280,720");
    assert_eq!(common::probe_entry(&out, "a:0", "stream=codec_name"), "aac");
}

#[test]
fn gap_is_filled() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 2.0, 320, 240, 30, true);
    let mut clips = pair("A", 0.0, 0.0, 1.0);
    clips.extend(pair("A", 2.0, 1.0, 2.0));
    let p = project(320, 240, vec![media("A", &a, 2.0, 320, 240, true)], clips);
    let out = export(&p, &settings(Format::Mp4, &dir.path().join("out.mp4"))).unwrap();
    assert_close(stream_secs(&out, "v:0"), 3.0, FRAME);
    assert_close(stream_secs(&out, "a:0"), 3.0, 0.05);
}

#[test]
fn mixed_audio_and_silent_sources() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 1.0, 320, 240, 30, true);
    let b = common::make_clip(dir.path(), "b.mp4", 1.0, 320, 240, 30, false);
    let mut clips = pair("A", 0.0, 0.0, 1.0);
    clips.push(clip("B", "video", 1.0, 0.0, 1.0));
    let p = project(320, 240, vec![media("A", &a, 1.0, 320, 240, true), media("B", &b, 1.0, 320, 240, false)], clips);
    let out = export(&p, &settings(Format::Mp4, &dir.path().join("out.mp4"))).unwrap();
    assert_close(stream_secs(&out, "v:0"), 2.0, FRAME);
    assert_close(stream_secs(&out, "a:0"), 2.0, 0.05);
}

#[test]
fn mixed_resolutions() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let odd = common::make_clip(dir.path(), "odd.mp4", 1.0, 641, 361, 30, true);
    let tall = common::make_clip(dir.path(), "tall.mp4", 1.0, 1080, 1920, 30, true);
    let mut clips = pair("O", 0.0, 0.0, 1.0);
    clips.extend(pair("T", 1.0, 0.0, 1.0));
    let p = project(641, 361, vec![media("O", &odd, 1.0, 641, 361, true), media("T", &tall, 1.0, 1080, 1920, true)], clips);
    let out = export(&p, &settings(Format::Mp4, &dir.path().join("out.mp4"))).unwrap();
    assert_eq!(common::probe_entry(&out, "v:0", "stream=width,height"), "640,360");
    assert_close(stream_secs(&out, "v:0"), 2.0, FRAME);
}

#[test]
fn gif_export() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 1.0, 640, 360, 30, true);
    let p = project(640, 360, vec![media("A", &a, 1.0, 640, 360, true)], pair("A", 0.0, 0.0, 1.0));
    let mut s = settings(Format::Gif, &dir.path().join("out.gif"));
    s.width = Some(320);
    let out = export(&p, &s).unwrap();
    assert_eq!(common::probe_entry(&out, "v:0", "stream=codec_name,width"), "gif,320");
}

#[test]
fn mp3_export() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 2.0, 320, 240, 30, true);
    let p = project(320, 240, vec![media("A", &a, 2.0, 320, 240, true)], pair("A", 0.0, 0.0, 2.0));
    let out = export(&p, &settings(Format::Mp3, &dir.path().join("out.mp3"))).unwrap();
    assert_eq!(common::probe_entry(&out, "v", "stream=codec_name"), "");
    assert_eq!(common::probe_entry(&out, "a:0", "stream=codec_name"), "mp3");
    let dur: f64 = common::probe_entry(&out, "a:0", "format=duration").parse().unwrap_or(0.0);
    assert_close(dur, 2.0, 0.05);
}

#[test]
fn unicode_path() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "it's clip ä.mp4", 1.0, 320, 240, 30, true);
    let info = easy_clipper_lib::media::probe::probe(&a).unwrap();
    assert!(info.has_audio);
    let p = project(320, 240, vec![media("A", &a, 1.0, 320, 240, true)], pair("A", 0.0, 0.2, 1.0));
    let out = export(&p, &settings(Format::Mp4, &dir.path().join("out ä's.mp4"))).unwrap();
    assert_close(stream_secs(&out, "v:0"), 0.8, FRAME);
}

#[test]
fn gpu_encoder_export() {
    if !common::have_ffmpeg() {
        return;
    }
    let enc = pick_encoder(&detect_encoders(), false);
    if enc == "libx264" {
        eprintln!("skipping: no GPU encoder");
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 1.0, 640, 360, 30, true);
    let p = project(640, 360, vec![media("A", &a, 1.0, 640, 360, true)], pair("A", 0.0, 0.0, 0.5));
    for q in [Quality::High, Quality::Medium, Quality::Small] {
        let mut s = settings(Format::Mp4, &dir.path().join(format!("gpu-{q:?}.mp4")));
        s.encoder = enc.clone();
        s.quality = q;
        let out = export(&p, &s).unwrap_or_else(|e| panic!("{enc} {q:?} failed: {e}"));
        assert_close(stream_secs(&out, "v:0"), 0.5, FRAME);
    }
}

#[test]
fn cancel_deletes_partial_file() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "long.mp4", 20.0, 1920, 1080, 30, true);
    let p = project(1920, 1080, vec![media("A", &a, 20.0, 1920, 1080, true)], pair("A", 0.0, 1.0, 20.0));
    let mut s = settings(Format::Mp4, &dir.path().join("cancelled.mp4"));
    s.quality = Quality::High;
    let out = PathBuf::from(&s.out_path);
    let handle = ExportHandle::default();
    let canceller = handle.clone();
    let err = run_export(build_export(&p, &s).unwrap(), &out, move |_| canceller.cancel(), &handle).unwrap_err();
    assert_eq!(err.message, "Export cancelled");
    assert!(!out.exists(), "partial file was left behind");
}

#[test]
fn progress_is_reported() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let a = common::make_clip(dir.path(), "a.mp4", 2.0, 320, 240, 30, true);
    let p = project(320, 240, vec![media("A", &a, 2.0, 320, 240, true)], pair("A", 0.0, 0.0, 2.0));
    let s = settings(Format::Mp4, &dir.path().join("out.mp4"));
    let seen = std::sync::Mutex::new(Vec::new());
    run_export(build_export(&p, &s).unwrap(), Path::new(&s.out_path), |f| seen.lock().unwrap().push(f), &ExportHandle::default()).unwrap();
    let seen = seen.into_inner().unwrap();
    assert!(!seen.is_empty());
    assert!(seen.iter().all(|f| (0.0..=1.0).contains(f)));
    assert_eq!(*seen.last().unwrap(), 1.0);
}

#[test]
fn failed_export_reports_ffmpeg_error() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let missing = dir.path().join("missing.mp4");
    let p = project(320, 240, vec![media("A", &missing, 1.0, 320, 240, true)], pair("A", 0.0, 0.0, 1.0));
    let s = settings(Format::Mp4, &dir.path().join("out.mp4"));
    let err = export(&p, &s).unwrap_err();
    assert!(err.contains("missing.mp4"), "error should name the file: {err}");
    assert!(!dir.path().join("out.mp4").exists());
}
