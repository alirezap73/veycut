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
    CaptionAppearance, Cue, MAX_SRT_BYTES, caption_style, offset_cues, parse_srt, parse_vtt,
    to_srt, to_vtt,
};
use concat_speech::transcribe::Segment;

use crate::host::{after_dialog, on_ui_in_project, spawn_in_project};
use crate::i18n::{t, tf};
use crate::panes::Msg;
use crate::panes::settings::installed;
use crate::studio::Studio;
use crate::ui::{CaptionNavigationRow, CaptionsSheetData};

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
    SectionChanged(i32),
    Navigate {
        clip_id: String,
        epoch: String,
        timeline_id: String,
    },
    NavigationPage {
        page: i32,
        epoch: String,
        timeline_id: String,
    },
    ExportFormatChanged(i32),
    ScopeChanged(i32),
    OffsetEdited(String),
    FindEdited(String),
    ReplacementEdited(String),
    ShiftText,
    RestyleText,
    ReplaceText,
    SrtSaved(Result<PathBuf, String>),
    SrtLoaded {
        result: Result<Vec<Cue>, String>,
        look: CaptionLook,
        base: Option<Box<TextStyle>>,
        run: u64,
    },
    /// The transcriber's worker reporting where it is, in percent.
    Progress {
        run: u64,
        percent: i32,
    },
    /// The transcriber's worker is done: what was said, or why not.
    Finished {
        run: u64,
        result: Result<Vec<Segment>, String>,
    },
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
    pub section: usize,
    navigation_page: usize,
    pub export_vtt: bool,
    pub all_text: bool,
    pub offset: String,
    pub find: String,
    pub replacement: String,
    /// Invalidates worker replies after cancellation or a new operation.
    run: u64,
    pub importing: bool,
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
            CaptionsMsg::SectionChanged(index) => self.section = (index.max(0) as usize).min(2),
            CaptionsMsg::ExportFormatChanged(index) => self.export_vtt = index == 1,
            CaptionsMsg::ScopeChanged(index) => {
                self.all_text = index == 1;
                self.navigation_page = 0;
            }
            CaptionsMsg::NavigationPage {
                page,
                epoch,
                timeline_id,
            } => {
                if self.open
                    && !self.running
                    && epoch == crate::host::project_epoch().to_string()
                    && timeline_id == studio.project().active().id
                {
                    self.navigation_page = page.max(0) as usize;
                }
            }
            CaptionsMsg::Navigate {
                clip_id,
                epoch,
                timeline_id,
            } => {
                if !self.open || self.running {
                    return;
                }
                let current = crate::host::project_epoch().to_string();
                if navigation_target(
                    studio.project().active(),
                    &current,
                    &epoch,
                    &timeline_id,
                    &clip_id,
                )
                .is_none()
                {
                    return;
                }
                // Commit the old inspector draft before changing selection.
                studio.flush_commit();
                if let Some(start) = navigation_target(
                    studio.project().active(),
                    &current,
                    &epoch,
                    &timeline_id,
                    &clip_id,
                ) {
                    studio.selection = vec![clip_id];
                    studio.transition_selected = None;
                    studio.seek(start);
                    self.open = false;
                }
            }
            CaptionsMsg::OffsetEdited(text) => self.offset = text,
            CaptionsMsg::FindEdited(text) => self.find = text,
            CaptionsMsg::ReplacementEdited(text) => self.replacement = text,
            CaptionsMsg::ShiftText | CaptionsMsg::RestyleText | CaptionsMsg::ReplaceText => {
                if self.running || studio.session.is_none() {
                    return;
                }
                let ids = (!self.all_text).then_some(studio.selection.as_slice());
                let timeline = studio.project().active();
                let result = match msg {
                    CaptionsMsg::ShiftText => self
                        .offset
                        .trim()
                        .parse::<f64>()
                        .map_err(|_| t("captions.invalidOffset"))
                        .and_then(|seconds| {
                            concat_project::subtitle_edits::shift(timeline, ids, seconds)
                        }),
                    CaptionsMsg::RestyleText => {
                        let (offset, size, appearance) = self.look();
                        concat_project::subtitle_edits::restyle(
                            timeline, ids, size, offset, appearance,
                        )
                    }
                    _ => concat_project::subtitle_edits::replace(
                        timeline,
                        ids,
                        &self.find,
                        &self.replacement,
                    ),
                };
                match result {
                    Ok((command, count)) => match studio.apply_checked(command) {
                        Ok(_) => {
                            self.message.clear();
                            studio.notify(&tf("captions.updatedText", &[&count]), false);
                        }
                        Err(error) => self.message = error,
                    },
                    Err(error) => self.message = error,
                }
            }
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
                self.run = self.run.wrapping_add(1);
                let run = self.run;
                self.running = true;
                self.importing = true;
                self.progress = 0.0;
                self.message.clear();
                let look = self.look();
                let base = studio.prefs.title_style.clone().map(Box::new);
                let offset = if self.srt_at_playhead {
                    f64::from(studio.playhead.max(0.0))
                } else {
                    0.0
                };
                spawn_in_project(
                    move || {
                        let text = concat_host::subtitle_files::read_utf8(&path, MAX_SRT_BYTES)
                            .map_err(|error| error.to_string())?;
                        let mut cues = if path
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("vtt"))
                        {
                            parse_vtt(&text)?
                        } else {
                            parse_srt(&text)?
                        };
                        offset_cues(&mut cues, offset)?;
                        Ok(cues)
                    },
                    move |studio, _, _, result| {
                        studio.handle(Msg::Captions(CaptionsMsg::SrtLoaded {
                            result,
                            look,
                            base,
                            run,
                        }))
                    },
                );
            }
            CaptionsMsg::SrtLoaded {
                result,
                look,
                base,
                run,
            } => {
                if run != self.run || !self.importing {
                    return;
                }
                self.running = false;
                self.importing = false;
                match result {
                    Ok(cues) => {
                        let count = cues.len();
                        let commands = cues
                            .into_iter()
                            .map(|cue| {
                                caption_clip(
                                    cue.text,
                                    cue.start,
                                    cue.duration,
                                    look,
                                    base.as_deref(),
                                )
                            })
                            .collect();
                        self.add_captions(studio, commands, count);
                    }
                    Err(error) => {
                        self.message = tf("captions.srtFailed", &[&error]);
                    }
                }
            }
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
                    offset: "0.5".into(),
                    run: self.run.wrapping_add(1),
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
                if self.running {
                    return;
                }
                if self.clip.is_some() {
                    self.run_sound(studio);
                } else {
                    self.run_script(studio);
                }
            }
            CaptionsMsg::Cancel => {
                self.run = self.run.wrapping_add(1);
                self.subject = None;
                self.importing = false;
                studio.host.transcriber.cancel();
                self.running = false;
                self.open = false;
            }
            CaptionsMsg::Progress { run, percent } => {
                if run != self.run || !self.running {
                    return;
                }
                self.progress = (percent as f32 / 100.0).clamp(0.0, 1.0);
            }
            CaptionsMsg::Finished { run, result } => {
                if run != self.run || !self.running {
                    return;
                }
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
                        if count == 0 {
                            self.open = false;
                            studio.notify(&t("captions.nothingSaidClip"), true);
                        } else {
                            self.add_captions(studio, commands, count);
                        }
                    }
                    // Asked for: the sheet is already on its way down.
                    Err(error) if error.contains("cancel") => self.open = false,
                    Err(error) => self.message = error,
                }
            }
        }
    }

    /// Close and report success only after the entire caption batch commits.
    /// A rejected edit leaves the script/import form available for correction.
    fn add_captions(&mut self, studio: &mut Studio, commands: Vec<Command>, count: usize) {
        match studio.apply_checked(Command::Batch { commands }) {
            Ok(_) => {
                self.open = false;
                self.message.clear();
                studio.notify(&tf("captions.addedCaptions", &[&count]), false);
            }
            Err(error) => self.message = error,
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
        let ids = (!self.all_text).then_some(studio.selection.as_slice());
        let cues = concat_project::subtitle_edits::selected_cues(studio.project().active(), ids);
        let output = match if self.export_vtt {
            to_vtt(&cues)
        } else {
            to_srt(&cues)
        } {
            Ok(output) => output,
            Err(error) => {
                self.message = tf("captions.srtExportFailed", &[&error]);
                return;
            }
        };
        let epoch = crate::host::project_epoch();
        let extension = if self.export_vtt { "vtt" } else { "srt" };
        let format = if self.export_vtt { "WebVTT" } else { "SubRip" };
        let title = t("captions.exportSrt");
        // Native panels pump playback timers on macOS. Ask without a
        // Studio borrow, then handle the answer only in the same project.
        after_dialog(
            move || {
                let file = if cfg!(any(target_os = "android", target_os = "ios")) {
                    let stamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_nanos();
                    directory.join(format!("captions-{stamp}.{extension}"))
                } else {
                    let file = crate::platform::save_file(
                        &title,
                        &directory,
                        &format!("captions.{extension}"),
                        (format, &[extension]),
                    )?;
                    if file
                        .extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case(extension))
                    {
                        file
                    } else {
                        file.with_extension(extension)
                    }
                };
                Some(file)
            },
            move |_, _, _, file| {
                if crate::host::project_epoch() != epoch {
                    return;
                }
                spawn_in_project(
                    move || {
                        concat_host::subtitle_files::write_atomic(&file, &output)
                            .map(|()| file)
                            .map_err(|error| error.to_string())
                    },
                    |studio, _, _, result| {
                        studio.handle(Msg::Captions(CaptionsMsg::SrtSaved(result)))
                    },
                );
            },
        );
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
        self.add_captions(studio, commands, count);
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
        self.run = self.run.wrapping_add(1);
        let run = self.run;
        self.importing = false;
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
                        studio.handle(Msg::Captions(CaptionsMsg::Progress { run, percent }));
                    });
                })
            },
            move |studio, _, _, result| {
                studio.handle(Msg::Captions(CaptionsMsg::Finished { run, result }))
            },
        );
    }

    /// The sheet as Slint shows it.
    pub fn data(&self, studio: &Studio) -> CaptionsSheetData {
        let timeline = studio.project().active();
        let ids = (!self.all_text).then_some(studio.selection.as_slice());
        let (clips, total, page) = if self.open && self.section == 2 && !self.running {
            navigation_page(timeline, ids, self.navigation_page)
        } else {
            (Vec::new(), 0, 0)
        };
        let epoch = crate::host::project_epoch().to_string();
        let rate = timeline.video.rate() as f32;
        let rows = clips
            .into_iter()
            .map(|clip| CaptionNavigationRow {
                clip_id: clip.id.as_str().into(),
                epoch: epoch.as_str().into(),
                timeline_id: timeline.id.as_str().into(),
                range: format!(
                    "{} – {}",
                    crate::format::frames_timecode(clip.start as f32, rate),
                    crate::format::frames_timecode((clip.start + clip.duration) as f32, rate),
                )
                .into(),
                preview: navigation_preview(&clip.text.as_ref().expect("text row").content).into(),
            })
            .collect::<Vec<_>>();
        let first = if total == 0 {
            0
        } else {
            page * NAVIGATION_PAGE_SIZE + 1
        };
        let last = (page * NAVIGATION_PAGE_SIZE + rows.len()).min(total);
        CaptionsSheetData {
            navigation_rows: slint::ModelRc::new(slint::VecModel::from(rows)),
            navigation_page: page as i32,
            navigation_epoch: epoch.into(),
            navigation_timeline: timeline.id.as_str().into(),
            navigation_range: format!("{first}–{last} / {total}").into(),
            navigation_previous: page > 0,
            navigation_next: last < total,
            open: self.open,
            from_sound: self.clip.is_some(),
            text: self.text.as_str().into(),
            model: self.model as i32,
            placement: self.placement as i32,
            size: self.size as i32,
            appearance: self.appearance as i32,
            srt_origin: i32::from(self.srt_at_playhead),
            section: self.section as i32,
            export_format: i32::from(self.export_vtt),
            scope: i32::from(self.all_text),
            text_count: if self.open {
                concat_project::subtitle_edits::count(
                    studio.project().active(),
                    (!self.all_text).then_some(studio.selection.as_slice()),
                ) as i32
            } else {
                0
            },
            offset: self.offset.as_str().into(),
            find: self.find.as_str().into(),
            replacement: self.replacement.as_str().into(),
            importing: self.importing,
            running: self.running,
            progress: self.progress,
            ready: !installed(&studio.settings.transcribers).is_empty(),
            message: self.message.as_str().into(),
        }
    }
}

/// Only a page is materialised as Slint rows; full text previews stay bounded.
const NAVIGATION_PAGE_SIZE: usize = 50;
const NAVIGATION_PREVIEW_CHARS: usize = 160;

fn navigation_page<'a>(
    timeline: &'a concat_project::model::Timeline,
    ids: Option<&[String]>,
    requested: usize,
) -> (Vec<&'a concat_project::model::Clip>, usize, usize) {
    let scope: Option<std::collections::HashSet<&str>> =
        ids.map(|ids| ids.iter().map(String::as_str).collect());
    let mut clips: Vec<_> = timeline
        .clips
        .iter()
        .map(|clip| clip.as_ref())
        .filter(|clip| {
            clip.text.is_some()
                && scope
                    .as_ref()
                    .is_none_or(|ids| ids.contains(clip.id.as_str()))
                && clip.start >= 0.0
                && clip.duration > 0.0
                && (clip.start as f32).is_finite()
                && ((clip.start + clip.duration) as f32).is_finite()
        })
        .collect();
    clips.sort_by(|a, b| {
        a.start
            .total_cmp(&b.start)
            .then_with(|| a.track_id.cmp(&b.track_id))
            .then_with(|| a.id.cmp(&b.id))
    });
    let total = clips.len();
    let page = requested.min(total.saturating_sub(1) / NAVIGATION_PAGE_SIZE);
    let rows = clips
        .into_iter()
        .skip(page * NAVIGATION_PAGE_SIZE)
        .take(NAVIGATION_PAGE_SIZE)
        .collect();
    (rows, total, page)
}

/// Row tokens bind IDs to the project and timeline that displayed them.
fn navigation_target(
    timeline: &concat_project::model::Timeline,
    current_epoch: &str,
    row_epoch: &str,
    row_timeline: &str,
    id: &str,
) -> Option<f32> {
    if current_epoch != row_epoch || timeline.id != row_timeline {
        return None;
    }
    let clip = timeline.clip(id)?;
    let start = clip.start as f32;
    (clip.text.is_some() && clip.start >= 0.0 && start.is_finite()).then_some(start)
}

fn navigation_preview(text: &str) -> String {
    let mut preview = String::new();
    let mut count = 0;
    let mut space = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            space = !preview.is_empty();
            continue;
        }
        if count >= NAVIGATION_PREVIEW_CHARS {
            preview.push('…');
            break;
        }
        if space {
            preview.push(' ');
            count += 1;
            space = false;
            if count >= NAVIGATION_PREVIEW_CHARS {
                preview.push('…');
                break;
            }
        }
        preview.push(ch);
        count += 1;
    }
    preview
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
/// together. Persian/Arabic question marks follow the same rule, and the
/// CJK marks end one on their own.
fn sentences(paragraph: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut chars = paragraph.chars().peekable();
    while let Some(ch) = chars.next() {
        current.push(ch);
        let ends = match ch {
            '。' | '！' | '？' => true,
            '.' | '!' | '?' | '؟' => chars.peek().is_none_or(|next| next.is_whitespace()),
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

    #[test]
    fn caption_navigation_sorts_scopes_and_bounds_pages() {
        let clips: Vec<_> = (0..103).rev().map(|index| serde_json::json!({
            "id":format!("c{index:03}"),"kind":"text","trackId":"T1","mediaId":"",
            "start":index as f64,"duration":1.0,"text":{"content":format!("سلام {index}")}
        })).chain([serde_json::json!({"id":"video","kind":"video","trackId":"T1","mediaId":"m1","start":0.0,"duration":1.0})]).collect();
        let editor = concat_project::Editor::from_document(&serde_json::json!({
            "tracks":[{"id":"T1"}],"clips":clips,
            "media":[{"id":"m1","path":"/fixture.mp4","kind":"video","duration":200.0}]
        }))
        .unwrap();
        let timeline = editor.project().active();
        let (rows, total, page) = super::navigation_page(timeline, None, 0);
        assert_eq!((rows.len(), total, page), (50, 103, 0));
        assert_eq!(rows[0].id, "c000");
        assert_eq!(rows[49].id, "c049");
        let (rows, total, page) = super::navigation_page(timeline, None, usize::MAX);
        assert_eq!((rows.len(), total, page), (3, 103, 2));
        assert_eq!(rows[0].id, "c100");
        let ids = vec!["c010".into(), "video".into(), "c002".into()];
        let (rows, total, page) = super::navigation_page(timeline, Some(&ids), 99);
        assert_eq!((rows.len(), total, page), (2, 2, 0));
        assert_eq!(rows[0].id, "c002");
        let empty: Vec<String> = vec![];
        assert!(
            super::navigation_page(timeline, Some(&empty), 0)
                .0
                .is_empty()
        );
        assert_eq!(
            super::navigation_target(timeline, "42", "42", &timeline.id, "c002"),
            Some(2.0)
        );
        assert!(super::navigation_target(timeline, "43", "42", &timeline.id, "c002").is_none());
        assert!(
            super::navigation_target(timeline, "42", "42", "different-timeline", "c002").is_none()
        );
        assert!(super::navigation_target(timeline, "42", "42", &timeline.id, "missing").is_none());
        assert!(super::navigation_target(timeline, "42", "42", &timeline.id, "video").is_none());
    }

    #[test]
    fn caption_navigation_ties_are_stable_and_invalid_times_are_excluded() {
        let editor = concat_project::Editor::from_document(&serde_json::json!({
            "tracks":[{"id":"T1"},{"id":"T2"}],
            "clips":[
                {"id":"z","kind":"text","trackId":"T2","mediaId":"","start":1.0,"duration":1.0,"text":{"content":"Hello"}},
                {"id":"b","kind":"text","trackId":"T1","mediaId":"","start":1.0,"duration":1.0,"text":{"content":"سلام"}},
                {"id":"a","kind":"text","trackId":"T1","mediaId":"","start":1.0,"duration":1.0,"text":{"content":"first"}}
            ]
        })).unwrap();
        let mut timeline = editor.project().active().clone();
        let (rows, _, _) = super::navigation_page(&timeline, None, 0);
        assert_eq!(
            rows.iter().map(|clip| clip.id.as_str()).collect::<Vec<_>>(),
            ["a", "b", "z"]
        );
        std::sync::Arc::make_mut(&mut timeline.clips[0]).start = f64::INFINITY;
        let (rows, total, _) = super::navigation_page(&timeline, None, 0);
        assert_eq!(total, 2);
        assert!(rows.iter().all(|clip| clip.id != "z"));
        assert!(super::navigation_target(&timeline, "1", "1", &timeline.id, "z").is_none());
    }

    #[test]
    fn caption_navigation_preview_is_utf8_safe_and_bounded() {
        assert_eq!(super::navigation_preview("  سلام\n\tHello  "), "سلام Hello");
        let text = "س".repeat(1000);
        let preview = super::navigation_preview(&text);
        assert_eq!(preview.chars().count(), 161);
        assert!(preview.ends_with('…'));
        assert_eq!(super::navigation_preview("   \n "), "");
    }

    /// Persian questions are separate captions just as English questions
    /// are; decimal punctuation and mixed-language words remain intact.
    #[test]
    fn persian_questions_keep_sentence_boundaries() {
        let lines = script_captions("سلام؟ خوبی؟ نسخه 3.5 آماده است. Ready?");
        let text: Vec<&str> = lines.iter().map(|(line, _)| line.as_str()).collect();
        assert_eq!(text, ["سلام؟", "خوبی؟", "نسخه 3.5 آماده است.", "Ready?"]);
        assert_eq!(script_captions("سلام؟خوبی")[0].0, "سلام؟خوبی");
    }

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
