//! Turns a timeline into a single FFmpeg command line.
//!
//! Every clip is its own input, cut with input-side `-ss`/`-t` (frame-exact because the output is
//! re-encoded). Gaps become black video / silent audio. Each track is normalised and joined with
//! `concat`, so the output is exactly as long as the timeline.

use crate::error::{AppError, AppResult};
use crate::export::model::{ExportClip, ExportMedia, ExportProject, ExportSettings, Format, Quality};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Segment {
    /// `clip` indexes the slice given to `track_segments`.
    Clip { clip: usize, len_us: i64 },
    Gap { len_us: i64 },
}

#[derive(Debug)]
pub struct BuiltCommand {
    pub args: Vec<String>,
    pub total_us: i64,
}

/// Output size: keeps aspect ratio, never upscales unless allowed, both sides even (rounded down).
pub fn output_size(src_w: u32, src_h: u32, target_w: Option<u32>, allow_upscale: bool) -> (u32, u32) {
    let even = |x: u32| (x - x % 2).max(2);
    let (w, h) = match target_w {
        Some(w) if w > 0 && src_w > 0 && (w <= src_w || allow_upscale) => {
            (w, (src_h as f64 * w as f64 / src_w as f64).round() as u32)
        }
        _ => (src_w, src_h),
    };
    (even(w), even(h))
}

/// Clips (sorted by start) with gaps before, between and after them, up to `total_us`.
pub fn track_segments(clips: &[&ExportClip], total_us: i64) -> Vec<Segment> {
    let mut order: Vec<usize> = (0..clips.len()).collect();
    order.sort_by_key(|&i| clips[i].start_us);
    let mut segs = Vec::new();
    let mut at = 0;
    for i in order {
        let c = clips[i];
        if c.start_us > at {
            segs.push(Segment::Gap { len_us: c.start_us - at });
        }
        segs.push(Segment::Clip { clip: i, len_us: c.len_us() });
        at = at.max(c.end_us());
    }
    if total_us > at {
        segs.push(Segment::Gap { len_us: total_us - at });
    }
    segs
}

fn secs(us: i64) -> String {
    format!("{:.6}", us as f64 / 1e6)
}

fn find_media<'a>(p: &'a ExportProject, id: &str) -> AppResult<&'a ExportMedia> {
    p.media.iter().find(|m| m.id == id).ok_or_else(|| AppError::new(format!("Missing media {id}")))
}

fn track<'a>(p: &'a ExportProject, name: &str) -> Vec<&'a ExportClip> {
    p.clips.iter().filter(|c| c.track == name).collect()
}

/// A single untrimmed H.264/AAC MP4 with unchanged settings can be copied without re-encoding.
pub fn can_fast_copy(p: &ExportProject, s: &ExportSettings) -> bool {
    if s.format != Format::Mp4 || s.width.is_some() || s.fps.is_some() {
        return false;
    }
    let (video, audio) = (track(p, "video"), track(p, "audio"));
    let [v] = video.as_slice() else { return false };
    let Ok(m) = find_media(p, &v.media_id) else { return false };
    let frame_us = 1_000_000 * p.fps_den as i64 / p.fps_num.max(1) as i64;
    let untrimmed = v.start_us == 0 && v.in_us == 0 && (m.duration_us - v.out_us).abs() <= frame_us;
    let audio_matches = match audio.as_slice() {
        [] => !m.has_audio,
        [a] => m.has_audio && a.media_id == v.media_id && a.start_us == v.start_us && a.in_us == v.in_us && a.out_us == v.out_us,
        _ => false,
    };
    untrimmed
        && audio_matches
        && m.format_name.contains("mp4")
        && m.video_codec.as_deref() == Some("h264")
        && m.audio_codec.as_deref().is_none_or(|c| c == "aac")
}

fn video_codec_args(encoder: &str, q: Quality) -> Vec<String> {
    let pick = |h: u32, m: u32, s: u32| match q {
        Quality::High => h,
        Quality::Medium => m,
        Quality::Small => s,
    };
    let args = match encoder {
        "h264_nvenc" => format!("-c:v h264_nvenc -preset p5 -rc vbr -cq {} -b:v 0", pick(19, 25, 31)),
        "h264_amf" => {
            let qp = pick(18, 24, 30);
            format!("-c:v h264_amf -rc cqp -qp_i {qp} -qp_p {qp}")
        }
        "h264_qsv" => format!("-c:v h264_qsv -global_quality {}", pick(20, 25, 31)),
        _ => format!("-c:v libx264 -preset veryfast -crf {}", pick(18, 23, 28)),
    };
    args.split(' ').map(str::to_owned).collect()
}

struct Builder {
    args: Vec<String>,
    filters: Vec<String>,
    inputs: usize,
}

impl Builder {
    fn input(&mut self, args: &[String]) -> usize {
        self.args.extend_from_slice(args);
        self.inputs += 1;
        self.inputs - 1
    }

    fn clip_input(&mut self, path: &str, c: &ExportClip) -> usize {
        let args = ["-ss", &secs(c.in_us), "-t", &secs(c.len_us()), "-i", path].map(str::to_owned);
        self.input(&args)
    }

    fn lavfi_input(&mut self, len_us: i64, source: String) -> usize {
        let args = ["-f".into(), "lavfi".into(), "-t".into(), secs(len_us), "-i".into(), source];
        self.input(&args)
    }

    /// Builds one track and returns the concat output label.
    fn track(&mut self, p: &ExportProject, clips: &[&ExportClip], total_us: i64, video: Option<(u32, u32, &str)>) -> AppResult<String> {
        let segs = track_segments(clips, total_us);
        let kind = if video.is_some() { "v" } else { "a" };
        let mut labels = String::new();
        for (k, seg) in segs.iter().enumerate() {
            let label = format!("{kind}{k}");
            let (input, len_us, stream) = match *seg {
                Segment::Clip { clip, len_us } => {
                    let m = find_media(p, &clips[clip].media_id)?;
                    (self.clip_input(&m.path, clips[clip]), len_us, format!("{kind}:0"))
                }
                Segment::Gap { len_us } => {
                    let source = match video {
                        Some((w, h, fps)) => format!("color=c=black:s={w}x{h}:r={fps}"),
                        None => "anullsrc=r=48000:cl=stereo".to_owned(),
                    };
                    (self.lavfi_input(len_us, source), len_us, kind.to_owned())
                }
            };
            let len = secs(len_us);
            let chain = match video {
                Some((w, h, fps)) => format!(
                    "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,\
                     setsar=1,fps={fps},format=yuv420p,tpad=stop_mode=clone:stop_duration={len},trim=duration={len},\
                     setpts=PTS-STARTPTS"
                ),
                None => format!(
                    "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:{len},asetpts=PTS-STARTPTS"
                ),
            };
            self.filters.push(format!("[{input}:{stream}]{chain}[{label}]"));
            labels.push_str(&format!("[{label}]"));
        }
        let out = format!("{kind}out");
        let (v, a) = if video.is_some() { (1, 0) } else { (0, 1) };
        self.filters.push(format!("{labels}concat=n={}:v={v}:a={a}[{out}]", segs.len()));
        Ok(out)
    }
}

pub fn build_export(p: &ExportProject, s: &ExportSettings) -> AppResult<BuiltCommand> {
    if p.clips.is_empty() {
        return Err(AppError::new("Timeline is empty"));
    }
    let total_us = p.clips.iter().map(ExportClip::end_us).max().unwrap_or(0);
    let mut b = Builder {
        args: ["-hide_banner", "-y", "-nostats", "-progress", "pipe:1"].map(str::to_owned).to_vec(),
        filters: Vec::new(),
        inputs: 0,
    };

    if can_fast_copy(p, s) {
        let m = find_media(p, &track(p, "video")[0].media_id)?;
        b.args.extend(["-i", &m.path, "-map", "0:v:0", "-map", "0:a?", "-c", "copy", "-movflags", "+faststart", &s.out_path].map(str::to_owned));
        return Ok(BuiltCommand { args: b.args, total_us });
    }

    let (video_clips, audio_clips) = (track(p, "video"), track(p, "audio"));
    let want_video = matches!(s.format, Format::Mp4 | Format::Gif);
    let want_audio = match s.format {
        Format::Mp4 => !audio_clips.is_empty(),
        Format::Gif => false,
        Format::Mp3 | Format::Wav => {
            if audio_clips.is_empty() {
                return Err(AppError::new("No audio on the timeline"));
            }
            true
        }
    };

    let (w, h) = output_size(p.width, p.height, s.width, s.allow_upscale);
    let fps = match s.fps {
        Some(f) => format!("{f}/1"),
        None => format!("{}/{}", p.fps_num, p.fps_den),
    };
    let vout = if want_video { Some(b.track(p, &video_clips, total_us, Some((w, h, &fps)))?) } else { None };
    let aout = if want_audio { Some(b.track(p, &audio_clips, total_us, None)?) } else { None };

    let mut out: Vec<String> = Vec::new();
    match s.format {
        Format::Gif => {
            b.filters.push(format!(
                "[{}]fps={},split[g1][g2];[g1]palettegen=stats_mode=diff[pal];[g2][pal]paletteuse=dither=bayer:bayer_scale=5[gif]",
                vout.as_deref().unwrap_or("vout"),
                s.gif_fps
            ));
            out.extend(["-map", "[gif]", "-loop", "0"].map(str::to_owned));
        }
        Format::Mp4 => {
            out.extend(["-map".to_owned(), format!("[{}]", vout.as_deref().unwrap_or("vout"))]);
            out.extend(video_codec_args(&s.encoder, s.quality));
            out.extend(["-pix_fmt", "yuv420p"].map(str::to_owned));
            match &aout {
                Some(a) => out.extend(["-map".to_owned(), format!("[{a}]"), "-c:a".into(), "aac".into(), "-b:a".into(), "192k".into()]),
                None => out.push("-an".into()),
            }
            out.extend(["-movflags", "+faststart"].map(str::to_owned));
        }
        Format::Mp3 | Format::Wav => {
            out.extend(["-map".to_owned(), format!("[{}]", aout.as_deref().unwrap_or("aout"))]);
            let codec: &[&str] = if s.format == Format::Mp3 { &["-c:a", "libmp3lame", "-q:a", "2"] } else { &["-c:a", "pcm_s16le"] };
            out.extend(codec.iter().map(|x| x.to_string()));
        }
    }

    b.args.extend(["-filter_complex".to_owned(), b.filters.join(";")]);
    b.args.extend(out);
    b.args.push(s.out_path.clone());
    Ok(BuiltCommand { args: b.args, total_us })
}
