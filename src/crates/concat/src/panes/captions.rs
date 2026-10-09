// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors

//! The captions sheet: the tray's Captions tool, as a form and then as a
//! progress report.
//!
//! What it captions is decided when it opens, not asked: the selected
//! clip's sound when one clip with sound is selected, and a script
//! otherwise. Either lands as one batch of title clips, one undo step.
//! The transcriber runs on a worker and reports as
//! [`CaptionsMsg::Progress`], ending as [`CaptionsMsg::Finished`].

use std::path::PathBuf;
use std::sync::Arc;

use concat_project::Command;
use concat_project::model::TextStyle;
use concat_project::subtitles::{
    CaptionAppearance, Cue, MAX_SRT_BYTES, caption_style, offset_cues, parse_srt, timeline_cues,
    to_srt,
};
use concat_speech::transcribe::Segment;

use crate::host::{on_ui_in_project, spawn_in_project};
use crate::i18n::{t, tf};
use crate::panes::Msg;
use crate::panes::settings::installed;
use crate::studio::Studio;
use crate::ui::CaptionsSheetData;

/// Where a caption sits, by the sheet's row: a frame-height fraction from
/// the centre, positive down. Bottom, centre, top.
const CAPTION_OFFSETS: [f64; 3] = [0.35, 0.0, -0.35];
/// A caption's cap height by the sheet's row, as a fraction of the frame.
const CAPTION_SIZES: [f64; 3] = [0.04, 0.05, 0.065];
type CaptionLook = (f64, f64, CaptionAppearance);
/// A rough speaking rate, for a script's timing and the speech sheet's
/// estimate.
pub const CHARS_PER_SECOND: f32 = 14.0;

/// Everything that can happen to the captions sheet.
#[derive(Clone, Debug)]
pub enum CaptionsMsg {
    /// The tray's Captions tool.
    Open,
    Close,
    TextEdited(String),
    ModelChanged(i32),
    PlacementChanged(i32),
    SizeChanged(i32),
    AppearanceChanged(i32),
    /// Run the pass the sheet describes.
    Begin,
    Cancel,
    ImportSrt(PathBuf),
    SrtOriginChanged(i32),
    ExportSrt,
    SrtSaved(Result<PathBuf, String>),
    SrtLoaded {
        result: Result<Vec<Cue>, String>,
        look: CaptionLook,
        base: Option<TextStyle>,
    },
    /// The transcriber's worker reporting where it is, in percent.
    Progress(i32),
    /// The transcriber's worker is done: what was said, or why not.
    Finished(Result<Vec<Segment>, String>),
}

/// The clip a transcription is running over, as the finished segments
/// need it: where it starts on the timeline and how fast it plays.
#[derive(Clone, Copy, Debug)]
struct Subject {
    start: f64,
    speed: f64,
    /// The look chosen when the run began.
    look: CaptionLook,
}

/// The captions sheet's state.
#[derive(Default)]
pub struct CaptionsPane {
    pub open: bool,
    /// The clip being transcribed: the one selected when the sheet opened,
    /// when it had sound. None, and the sheet is a script instead.
    pub clip: Option<String>,
    /// The script's words.
    pub text: String,
    /// Row in the installed transcriber list.
    pub model: usize,
    /// 0 bottom, 1 centre, 2 top.
    pub placement: usize,
    /// 0 small, 1 medium, 2 large.
    pub size: usize,
    /// 0 title preference, 1 box, 2 outline.
    pub appearance: usize,
    /// Whether imported SRT times are relative to the playhead snapshot.
    pub srt_at_playhead: bool,
    pub running: bool,
    pub progress: f32,
    /// Why the last run failed, when it did.
    pub message: String,
    /// The clip under the running transcription.
    subject: Option<Subject>,
}

impl CaptionsPane {
    /// Applies one message. The studio is the rest of the window; while
    /// this runs the studio's copy of the pane is a blank it must not read.
    pub fn update(&mut self, msg: CaptionsMsg, studio: &mut Studio) {
        match msg {
            CaptionsMsg::AppearanceChanged(index) => {
                self.appearance = (index.max(0) as usize).min(2);
            }
            CaptionsMsg::SrtOriginChanged(index) => self.srt_at_playhead = index == 1,
            CaptionsMsg::ExportSrt => self.export_srt(studio),
            CaptionsMsg::SrtSaved(result) => match result {
                Ok(path) => {
                    self.message.clear();
                    studio.notify(&tf("captions.srtSaved", &[&path.display()]), false);
                }
                Err(error) => {
                    self.message = tf("captions.srtExportFailed", &[&error]);
                }
            },
            CaptionsMsg::ImportSrt(path) => {
                if self.running || studio.session.is_none() {
                    return;
                }
                let look = self.look();
                let base = studio.prefs.title_style.clone();
                let offset = if self.srt_at_playhead {
                    f64::from(studio.playhead.max(0.0))
                } else {
                    0.0
                };
                spawn_in_project(
                    move || {
                        let text = concat_host::subtitle_files::read_utf8(&path, MAX_SRT_BYTES)
                            .map_err(|error| error.to_string())?;
                        let mut cues = parse_srt(&text)?;
                        offset_cues(&mut cues, offset)?;
                        Ok(cues)
                    },
                    move |studio, _, _, result| {
                        studio.handle(Msg::Captions(CaptionsMsg::SrtLoaded { result, look, base }))
                    },
                );
            }
            CaptionsMsg::SrtLoaded { result, look, base } => match result {
                Ok(cues) => {
                    let count = cues.len();
                    let commands = cues
                        .into_iter()
                        .map(|cue| {
                            caption_clip(cue.text, cue.start, cue.duration, look, base.as_ref())
                        })
                        .collect();
                    if studio.apply(Command::Batch { commands }).is_some() {
                        self.open = false;
                        self.message.clear();
                        studio.notify(&tf("captions.addedCaptions", &[&count]), false);
                    }
                }
                Err(error) => {
                    self.message = tf("captions.srtFailed", &[&error]);
                }
            },
            CaptionsMsg::Open => {
                let installed = installed(&studio.settings.transcribers);
                let model = installed.iter().position(|model| model.active).unwrap_or(0);
                let clip = studio
                    .sole_selection()
                    .and_then(|id| studio.clip(&id))
                    .filter(|clip| studio.clip_has_sound(clip))
                    .map(|clip| clip.id.clone());
                *self = CaptionsPane {
                    open: true,
                    clip,
                    model,
                    placement: 0,
                    size: 1,
                    ..CaptionsPane::default()
                };
            }
            CaptionsMsg::Close => self.open = false,
            CaptionsMsg::TextEdited(text) => self.text = text,
            CaptionsMsg::ModelChanged(index) => self.model = index.max(0) as usize,
            CaptionsMsg::PlacementChanged(index) => {
                self.placement = (index.max(0) as usize).min(2);
            }
            CaptionsMsg::SizeChanged(index) => self.size = (index.max(0) as usize).min(2),
            CaptionsMsg::Begin => {
                if self.clip.is_some() {
                    self.run_sound(studio);
                } else {
                    self.run_script(studio);
                }
            }
            CaptionsMsg::Cancel => {
                studio.host.transcriber.cancel();
                self.running = false;
                self.open = false;
            }
            CaptionsMsg::Progress(percent) => {
                self.progress = (percent as f32 / 100.0).clamp(0.0, 1.0);
            }
            CaptionsMsg::Finished(result) => {
                self.running = false;
                let subject = self.subject.take();
                match result {
                    Ok(segments) => {
                        let Some(subject) = subject else {
                            return;
                        };
                        let look = subject.look;
                        let base = studio.prefs.title_style.clone();
                        let commands: Vec<Command> = segments
                            .into_iter()
                            .filter_map(|segment| {
                                let text = segment.text.trim().to_owned();
                                (!text.is_empty()).then(|| {
                                    caption_clip(
                                        text,
                                        subject.start + segment.start / subject.speed,
                                        ((segment.end - segment.start) / subject.speed).max(0.2),
                                        look,
                                        base.as_ref(),
                                    )
                                })
                            })
                            .collect();
                        let count = commands.len();
                        self.open = false;
                        if count == 0 {
                            studio.notify(&t("captions.nothingSaidClip"), true);
                        } else {
                            studio.apply(Command::Batch { commands });
                            studio.notify(&tf("captions.addedCaptions", &[&count]), false);
                        }
                    }
                    // Asked for: the sheet is already on its way down.
                    Err(error) if error.contains("cancel") => self.open = false,
                    Err(error) => self.message = error,
                }
            }
        }
    }

    /// Snapshot the active timeline's text, then choose and write its SRT.
    fn export_srt(&mut self, studio: &mut Studio) {
        if self.running {
            return;
        }
        let Some(session) = studio.session.as_ref() else {
            return;
        };
        let directory = PathBuf::from(session.path());
        let output = match to_srt(&timeline_cues(studio.project().active())) {
            Ok(output) => output,
            Err(error) => {
                self.message = tf("captions.srtExportFailed", &[&error]);
                return;
            }
        };
        let epoch = crate::host::project_epoch();
        let title = t("captions.exportSrt");
        // Defer the native dialog out of Slint's current callback, as the
        // frame/audio exporters do: macOS dialogs pump the event loop.
        on_ui_in_project(epoch, move |_, _, _| {
            let file = if cfg!(any(target_os = "android", target_os = "ios")) {
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos();
                directory.join(format!("captions-{stamp}.srt"))
            } else {
                let Some(file) = crate::platform::save_file(
                    &title,
                    &directory,
                    "captions.srt",
                    ("SubRip", &["srt"]),
                ) else {
                    return;
                };
                if file
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("srt"))
                {
                    file
                } else {
                    file.with_extension("srt")
                }
            };
            if crate::host::project_epoch() != epoch {
                return;
            }
            spawn_in_project(
                move || {
                    concat_host::subtitle_files::write_atomic(&file, &output)
                        .map(|()| file)
                        .map_err(|error| error.to_string())
                },
                |studio, _, _, result| studio.handle(Msg::Captions(CaptionsMsg::SrtSaved(result))),
            );
        });
    }

    /// A caption's look, by the sheet's rows: where it sits and its size.
    fn look(&self) -> CaptionLook {
        (
            CAPTION_OFFSETS[self.placement.min(2)],
            CAPTION_SIZES[self.size.min(2)],
            match self.appearance {
                1 => CaptionAppearance::Box,
                2 => CaptionAppearance::Outline,
                _ => CaptionAppearance::Inherit,
            },
        )
    }

    /// The script as titles, one after another from the playhead.
    fn run_script(&mut self, studio: &mut Studio) {
        let lines = script_captions(&self.text);
        if lines.is_empty() {
            self.message = t("captions.nothingToCaptionYet");
            return;
        }
        let look = self.look();
        let mut at = f64::from(studio.playhead);
        let base = studio.prefs.title_style.clone();
        let commands: Vec<Command> = lines
            .into_iter()
            .map(|(text, seconds)| {
                let command = caption_clip(text, at, seconds, look, base.as_ref());
                at += seconds;
                command
            })
            .collect();
        let count = commands.len();
        self.open = false;
        studio.apply(Command::Batch { commands });
        studio.notify(&tf("captions.addedCaptions", &[&count]), false);
    }

    /// The sheet's clip through the transcriber on a worker, reporting into
    /// the sheet as it goes.
    fn run_sound(&mut self, studio: &mut Studio) {
        let Some(clip) = self.clip.as_ref().and_then(|id| studio.clip(id)).cloned() else {
            self.message = t("captions.clipNoLongerTimeline");
            return;
        };
        let Some(media) = studio.project().media_by_id(&clip.media_id).cloned() else {
            self.message = t("captions.clipHasNoFile");
            return;
        };
        let Some(model) = installed(&studio.settings.transcribers)
            .get(self.model)
            .map(|model| model.id.clone())
        else {
            self.message = t("captions.downloadTranscriberModelFirst");
            return;
        };
        let request = concat_speech::transcribe::TranscribeRequest {
            path: media.path.clone(),
            audio_stream: clip.audio_stream,
            source_start: clip.source_start,
            window: clip.duration * clip.speed,
            model_id: model,
        };
        let dirs = studio.host.dirs.clone();
        let transcriber = Arc::clone(&studio.host.transcriber);
        self.subject = Some(Subject {
            start: clip.start,
            speed: clip.speed,
            look: self.look(),
        });
        self.running = true;
        self.progress = 0.0;
        self.message.clear();
        let epoch = crate::host::project_epoch();
        spawn_in_project(
            move || {
                transcriber.transcribe(&dirs, &request, move |percent| {
                    on_ui_in_project(epoch, move |studio, _, _| {
                        studio.handle(Msg::Captions(CaptionsMsg::Progress(percent)));
                    });
                })
            },
            |studio, _, _, result| studio.handle(Msg::Captions(CaptionsMsg::Finished(result))),
        );
    }

    /// The sheet as Slint shows it.
    pub fn data(&self, studio: &Studio) -> CaptionsSheetData {
        CaptionsSheetData {
            open: self.open,
            from_sound: self.clip.is_some(),
            text: self.text.as_str().into(),
            model: self.model as i32,
            placement: self.placement as i32,
            size: self.size as i32,
            appearance: self.appearance as i32,
            srt_origin: i32::from(self.srt_at_playhead),
            running: self.running,
            progress: self.progress,
            ready: !installed(&studio.settings.transcribers).is_empty(),
            message: self.message.as_str().into(),
        }
    }
}

/// One caption as a title clip: its words, when and for how long, and
/// its look.
fn caption_clip(
    text: String,
    start: f64,
    duration: f64,
    look: CaptionLook,
    base: Option<&TextStyle>,
) -> Command {
    let (offset_y, font_size, appearance) = look;
    let style = caption_style(text, font_size, base, appearance);
    Command::AddTextClip {
        track_id: None,
        above: true,
        start,
        style: Some(style),
        duration: Some(duration),
        offset_y: Some(offset_y),
    }
}

/// Longest a caption line gets before it is wrapped: about what two lines
/// of broadcast subtitle hold, and what a reader takes in at a glance.
const CAPTION_CHARS: usize = 42;

/// A script as caption lines, each with how long it stays up: a line's
/// reading time at [`CHARS_PER_SECOND`], held to one second at least so
/// a short word is not a flicker, and seven at most so a long line does
/// not hang. A line break in the script is a break the author asked for;
/// within a paragraph a sentence is a caption, and a long sentence wraps
/// at its words.
fn script_captions(text: &str) -> Vec<(String, f64)> {
    text.lines()
        .flat_map(sentences)
        .flat_map(|sentence| wrap_caption(&sentence))
        .map(|line| {
            let seconds =
                (line.chars().count() as f64 / f64::from(CHARS_PER_SECOND)).clamp(1.0, 7.0);
            (line, seconds)
        })
        .collect()
}

/// A paragraph's sentences. A full stop, question or exclamation mark ends
/// one when it is followed by space or by the end - so "3.5" and "e.g." hold
/// together - and the CJK marks end one on their own.
fn sentences(paragraph: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut chars = paragraph.chars().peekable();
    while let Some(ch) = chars.next() {
        current.push(ch);
        let ends = match ch {
            '。' | '！' | '？' => true,
            '.' | '!' | '?' => chars.peek().is_none_or(|next| next.is_whitespace()),
            _ => false,
        };
        if ends {
            let sentence = current.trim();
            if !sentence.is_empty() {
                out.push(sentence.to_owned());
            }
            current.clear();
        }
    }
    let rest = current.trim();
    if !rest.is_empty() {
        out.push(rest.to_owned());
    }
    out
}

/// A sentence in lines of at most [`CAPTION_CHARS`], broken between words;
/// a word longer than a line, or a run of CJK with no spaces, is broken
/// where it must be.
fn wrap_caption(sentence: &str) -> Vec<String> {
    let mut lines = Vec::new();
    let mut line = String::new();
    let mut line_chars = 0;
    for word in sentence.split_whitespace() {
        let word_chars = word.chars().count();
        if line_chars > 0 && line_chars + 1 + word_chars > CAPTION_CHARS {
            lines.push(std::mem::take(&mut line));
            line_chars = 0;
        }
        if word_chars > CAPTION_CHARS {
            let mut piece = String::new();
            for ch in word.chars() {
                piece.push(ch);
                if piece.chars().count() == CAPTION_CHARS {
                    lines.push(std::mem::take(&mut piece));
                }
            }
            line = piece;
            line_chars = line.chars().count();
            continue;
        }
        if line_chars > 0 {
            line.push(' ');
            line_chars += 1;
        }
        line.push_str(word);
        line_chars += word_chars;
    }
    if !line.is_empty() {
        lines.push(line);
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::script_captions;

    /// A script becomes one caption per sentence, a hand line break is
    /// kept, a long sentence wraps at its words, and each line is held for
    /// its reading time within one to seven seconds.
    #[test]
    fn a_script_is_cut_into_readable_lines() {
        let lines = script_captions(
            "Hello there. This is version 3.5, mind!\n\nA sentence that runs on for far \
             longer than a caption line has any business running on for. Ok?",
        );
        let text: Vec<&str> = lines.iter().map(|(line, _)| line.as_str()).collect();
        assert_eq!(
            text,
            [
                "Hello there.",
                "This is version 3.5, mind!",
                "A sentence that runs on for far longer",
                "than a caption line has any business",
                "running on for.",
                "Ok?",
            ]
        );
        assert!(
            lines
                .iter()
                .all(|(_, seconds)| (1.0..=7.0).contains(seconds))
        );
        assert_eq!(lines[0].1, 1.0);
        assert!(lines[2].1 > lines[0].1);
        assert!(script_captions("  \n ").is_empty());
        assert_eq!(script_captions("你好。再见！").len(), 2);
    }
}
