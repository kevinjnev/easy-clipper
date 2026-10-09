mod common;

use easy_clipper_lib::media::{thumbs::thumbnails, waveform::waveform};

#[test]
fn thumbnails_make_a_strip_of_ten() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let clip = common::make_clip(dir.path(), "t.mp4", 2.0, 320, 240, 30, true);
    let sprite = thumbnails(&clip, 2_000_000).unwrap();
    assert!(sprite.is_file());
    assert_eq!(common::probe_entry(&sprite, "v:0", "stream=width"), "1600");
}

#[test]
fn waveform_has_80_peaks_per_second() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let clip = common::make_clip(dir.path(), "w.mp4", 2.0, 320, 240, 30, true);
    let peaks = waveform(&clip).unwrap();
    // AAC pads the last frame (1024 samples ≈ 23 ms ≈ 2 peaks).
    assert!((159..=163).contains(&peaks.len()), "got {} peaks", peaks.len());
    // The padded tail is silent; the 2 s of tone must not be.
    assert!(peaks[..158].iter().all(|&p| p > 0.1), "some peaks were silent: {peaks:?}");
}

#[test]
fn heavy_file_gets_a_720p_60fps_preview_copy() {
    if !common::have_ffmpeg() {
        return;
    }
    let dir = tempfile::tempdir().unwrap();
    let clip = common::make_clip(dir.path(), "heavy.mp4", 1.0, 2560, 1440, 120, true);
    let info = easy_clipper_lib::media::probe::probe(&clip).unwrap();
    assert!(easy_clipper_lib::media::proxy::needs_proxy(&info, "mp4"));
    let proxy = easy_clipper_lib::media::proxy::make_proxy(&clip, &info).unwrap();
    assert_eq!(common::probe_entry(&proxy, "v:0", "stream=width,height"), "1280,720");
    assert_eq!(common::probe_entry(&proxy, "v:0", "stream=avg_frame_rate"), "60/1");
    assert_eq!(common::probe_entry(&proxy, "a:0", "stream=codec_name"), "aac");
}
