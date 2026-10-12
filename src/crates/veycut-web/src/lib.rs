// SPDX-License-Identifier: AGPL-3.0-or-later
//! Browser project operations backed by the shared project engine.
//!
//! JavaScript owns media blobs and their decoding. Imported metadata names a
//! stable browser media key, not a filesystem path this crate tries to open.
//! All methods return JSON envelopes; project documents retain native format.
use concat_core::frame::MAX_SIDE;
use concat_core::time::FrameRate;
use concat_project::model::{
    ClipKind, TextStyle,
    ranges::{MAX_TIME, MIN_CLIP_DURATION},
};
use concat_project::{Command, DocumentSettings, Editor};
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashSet;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_CAPTION_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_DOCUMENT_BYTES: usize = 8 * 1024 * 1024;
const MAX_MEDIA: usize = 128;
const MAX_CLIPS: usize = 512;
const MAX_TRACKS: usize = 64;
const MAX_TIMELINES: usize = 8;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateOptions {
    #[serde(default = "default_name")]
    name: String,
    #[serde(default = "default_width")]
    width: u32,
    #[serde(default = "default_height")]
    height: u32,
    #[serde(default = "default_rate")]
    rate_num: i64,
    #[serde(default = "default_den")]
    rate_den: i64,
}
/// A bounded import owns only the title IDs explicitly being replaced.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptionImport {
    #[serde(default)]
    replace_clip_ids: Vec<String>,
    cues: Vec<CaptionCue>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CaptionCue {
    #[serde(default, rename = "id")]
    _id: Option<String>,
    start: f64,
    end: f64,
    text: String,
    #[serde(default)]
    style: Option<TextStyle>,
    #[serde(default)]
    offset_y: Option<f64>,
}
fn default_name() -> String {
    "Untitled project".to_owned()
}
fn default_width() -> u32 {
    720
}
fn default_height() -> u32 {
    1280
}
fn default_rate() -> i64 {
    30
}
fn default_den() -> i64 {
    1
}

/// One browser editing session. Undo, ids and edit semantics belong to Editor.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WebEditor {
    editor: Editor,
    name: String,
}

impl Default for WebEditor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl WebEditor {
    /// Creates an empty portrait session without accessing a browser or disk.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        let options = CreateOptions {
            name: default_name(),
            width: default_width(),
            height: default_height(),
            rate_num: default_rate(),
            rate_den: default_den(),
        };
        Self {
            editor: Editor::with_video(settings(&options).video()),
            name: options.name,
        }
    }

    /// Replaces the session after validating name, dimensions and frame rate.
    pub fn create_project(&mut self, options_json: &str) -> String {
        if options_json.len() > MAX_REQUEST_BYTES {
            return error(
                "requestTooLarge",
                "Project settings exceed the browser request limit.",
            );
        }
        let Ok(options) = serde_json::from_str::<CreateOptions>(options_json) else {
            return error(
                "invalidSettings",
                "Project settings are not valid JSON settings.",
            );
        };
        if !valid_name(&options.name)
            || options.width < 2
            || options.height < 2
            || options.width > MAX_SIDE
            || options.height > MAX_SIDE
            || !options.width.is_multiple_of(2)
            || !options.height.is_multiple_of(2)
            || FrameRate::checked(options.rate_num, options.rate_den).is_none()
            || options.rate_num as f64 / options.rate_den as f64 > 240.0
        {
            return error(
                "invalidSettings",
                "Use a name of 1–128 characters, even dimensions up to 8192, and a valid frame rate up to 240.",
            );
        }
        self.editor = Editor::with_video(settings(&options).video());
        self.name = options.name;
        self.response(true, None)
    }

    /// Opens a native-format document; rejected documents leave this session intact.
    pub fn open_project(&mut self, document_json: &str) -> String {
        if document_json.len() > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The project exceeds the browser document limit.",
            );
        }
        let Ok(document) = serde_json::from_str::<Value>(document_json) else {
            return error("invalidProject", "The project is not valid JSON.");
        };
        let name = document
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Untitled project");
        if !valid_name(name) {
            return error(
                "invalidProject",
                "The project name must contain 1–128 characters.",
            );
        }
        let Some(editor) = Editor::from_document(&document) else {
            return error(
                "invalidProject",
                "The shared engine could not open this project format.",
            );
        };
        if !within_capacity(&editor) {
            return error(
                "projectCapacity",
                "This project exceeds browser media, clip, track or timeline limits.",
            );
        }
        let restored = editor.to_document(&document_settings(name, &editor));
        if encoded_len(&restored) > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The restored project exceeds the browser document limit.",
            );
        }
        self.editor = editor;
        self.name = name.to_owned();
        self.response(true, None)
    }

    /// Applies one supported native command, preserving the engine's atomicity and history.
    /// Native clip, group, property, key, track and timeline edits are enabled.
    /// A batch of up to 32 direct supported commands is one atomic edit.
    /// Rendering support is the browser caller's responsibility; preserving a
    /// native property does not promise that its effect can be drawn in a browser.
    pub fn apply_command(&mut self, command_json: &str) -> String {
        if command_json.len() > MAX_REQUEST_BYTES {
            return error(
                "requestTooLarge",
                "The edit exceeds the browser request limit.",
            );
        }
        let Ok(command) = serde_json::from_str::<Command>(command_json) else {
            return error(
                "invalidCommand",
                "The edit is not a valid shared-engine command.",
            );
        };
        let commands: Vec<&Command> = if let Command::Batch { commands } = &command {
            if commands.len() > 32 {
                return error(
                    "requestCapacity",
                    "A browser batch supports at most 32 edits.",
                );
            }
            commands.iter().collect()
        } else {
            vec![&command]
        };
        let mut media = self.editor.project().media.len();
        let mut clips = clip_count(&self.editor);
        let mut tracks = track_count(&self.editor);
        let mut timelines = self.editor.project().timelines.len();
        let mut sounds_per_media = self
            .editor
            .project()
            .media
            .iter()
            .map(|item| item.audio_tracks.len().max(1))
            .max()
            .unwrap_or(1);
        let largest_clip = self
            .editor
            .project()
            .timelines
            .iter()
            .flat_map(|timeline| &timeline.clips)
            .map(|clip| serde_json::to_vec(clip).map_or(MAX_DOCUMENT_BYTES, |bytes| bytes.len()))
            .max()
            .unwrap_or(4096);
        let largest_timeline = self
            .editor
            .project()
            .timelines
            .iter()
            .map(|timeline| {
                serde_json::to_vec(timeline).map_or(MAX_DOCUMENT_BYTES, |bytes| bytes.len())
            })
            .max()
            .unwrap_or(4096);
        let mut additional = 4096usize;
        for edit in commands {
            match edit {
                Command::AddMedia { item } => {
                    if item.path.is_empty()
                        || item.path.len() > 1024
                        || item.name.chars().count() > 256
                        || item
                            .duration
                            .is_some_and(|seconds| !seconds.is_finite() || seconds <= 0.0)
                    {
                        return error(
                            "invalidMedia",
                            "Use a stable media key, a short display name and a positive duration when known.",
                        );
                    }
                    sounds_per_media = sounds_per_media.max(item.audio_tracks.len().max(1));
                    media += 1;
                }
                Command::AddClip { .. }
                | Command::AddClipAtFirstFree { .. }
                | Command::PasteClip { .. } => clips += 1,
                Command::DuplicateClip { .. } => {
                    clips += 1;
                    additional = additional.saturating_add(largest_clip.saturating_mul(2));
                }
                Command::PasteClips { clips: snapshots } => {
                    clips = clips.saturating_add(snapshots.len())
                }
                Command::DetachAudio { .. } => {
                    // A file may hold separately named sound streams. The engine
                    // clones one complete sound clip and possibly a lane for each.
                    clips = clips.saturating_add(sounds_per_media);
                    tracks = tracks.saturating_add(sounds_per_media);
                    additional = additional.saturating_add(
                        sounds_per_media.saturating_mul(
                            largest_clip
                                .saturating_add(command_json.len())
                                .saturating_mul(2)
                                .saturating_add(4096),
                        ),
                    );
                }
                Command::AddTimeline => {
                    timelines += 1;
                    tracks += 4;
                }
                Command::AddTextClip { .. }
                | Command::AddShapeClip { .. }
                | Command::AddLayerClip { .. } => {
                    clips += 1;
                    // The shared placement policy may create a lane.
                    tracks += 1;
                }
                Command::SplitClips { clip_ids, .. } => {
                    clips = clips.saturating_add(clip_ids.len());
                    let growth = self
                        .editor
                        .project()
                        .timelines
                        .iter()
                        .flat_map(|timeline| &timeline.clips)
                        .filter(|clip| clip_ids.contains(&clip.id))
                        .map(|clip| {
                            serde_json::to_vec(clip)
                                .map_or(MAX_DOCUMENT_BYTES, |v| v.len().saturating_mul(2))
                        })
                        .fold(0usize, usize::saturating_add);
                    additional = additional.saturating_add(growth);
                }
                Command::AddTrack { .. } => tracks += 1,
                Command::TrimClip { .. }
                | Command::MoveClips { .. }
                | Command::UpdateClip { .. }
                | Command::RemoveClips { .. }
                | Command::MergeClips { .. }
                | Command::RemoveMedia { .. }
                | Command::RemoveTrack { .. }
                | Command::SetTrackFlag { .. }
                | Command::SetClipSpeed { .. }
                | Command::SetClipTransform { .. }
                | Command::SetClipSpeedCurve { .. }
                | Command::SetClipKey { .. }
                | Command::ClearClipKey { .. }
                | Command::ClearClipKeys { .. }
                | Command::SetEffectKey { .. }
                | Command::ClearEffectKey { .. }
                | Command::ClearEffectKeys { .. }
                | Command::ReattachAudio { .. }
                | Command::RemoveTimeline { .. }
                | Command::RenameTimeline { .. }
                | Command::MoveTimeline { .. } => {}
                Command::SelectTimeline { .. } => {
                    // Selecting a different timeline changes the flat mirror,
                    // even though no clip is added to the native project.
                    additional = additional.saturating_add(largest_timeline);
                }
                Command::SetTimelineVideo { video, .. } => {
                    if !video.is_sane()
                        || video.width > MAX_SIDE
                        || video.height > MAX_SIDE
                        || !video.width.is_multiple_of(2)
                        || !video.height.is_multiple_of(2)
                        || video.rate_num as f64 / video.rate_den as f64 > 240.0
                    {
                        return error(
                            "invalidSettings",
                            "Use even dimensions up to 8192 and a valid frame rate up to 240.",
                        );
                    }
                }
                _ => {
                    return error(
                        "unsupportedCommand",
                        "This operation is not enabled in the browser editor; batches cannot be nested.",
                    );
                }
            }
            additional = additional.saturating_add(command_json.len().saturating_mul(2) + 4096);
        }
        if media > MAX_MEDIA
            || clips > MAX_CLIPS
            || tracks > MAX_TRACKS
            || timelines > MAX_TIMELINES
        {
            return error(
                "projectCapacity",
                "The edit exceeds browser limits of 128 media items, 512 clips, 64 tracks or 8 timelines.",
            );
        }
        // Reserve room for flat timeline mirrors and default properties before
        // touching history. A rejected save-size budget never consumes an Undo.
        if encoded_len(&self.document()).saturating_add(additional) > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The edit would exceed the browser document limit.",
            );
        }
        self.apply_staged(command)
    }

    /// Replaces an explicitly identified set of native captions in one Undo.
    /// The dedicated 1 MiB import envelope accepts up to 512 timed cues while
    /// ordinary command batches stay capped at 32. Native project limits still
    /// apply, including clips on other timelines. Cues share one stable lane;
    /// overlapping times are refused rather than silently retimed.
    pub fn replace_captions(&mut self, import_json: &str) -> String {
        if import_json.len() > MAX_CAPTION_REQUEST_BYTES {
            return error(
                "requestTooLarge",
                "Caption import exceeds the 1 MiB request limit.",
            );
        }
        let Ok(mut import) = serde_json::from_str::<CaptionImport>(import_json) else {
            return error(
                "invalidCaptions",
                "Caption import is not a valid timed-cue request.",
            );
        };
        if import.cues.len() > MAX_CLIPS || import.replace_clip_ids.len() > MAX_CLIPS {
            return error(
                "projectCapacity",
                "A caption import supports at most 512 cues and replaced clips.",
            );
        }
        let mut replaced = HashSet::new();
        for id in &import.replace_clip_ids {
            if !replaced.insert(id.as_str())
                || self
                    .editor
                    .project()
                    .active()
                    .clip(id)
                    .is_none_or(|clip| clip.kind != ClipKind::Text)
            {
                return error(
                    "invalidCaptions",
                    "Replaced captions must name distinct text clips on the active timeline.",
                );
            }
        }
        if clip_count(&self.editor) - replaced.len() + import.cues.len() > MAX_CLIPS {
            return error(
                "projectCapacity",
                "Captions and other project clips exceed the 512-clip limit.",
            );
        }
        for cue in &import.cues {
            if !cue.start.is_finite()
                || !cue.end.is_finite()
                || cue.start < 0.0
                || cue.end > MAX_TIME
                || cue.end - cue.start < MIN_CLIP_DURATION
                || cue.text.trim().is_empty()
                || cue.text.chars().count() > 10_000
                || cue
                    .offset_y
                    .is_some_and(|offset| !offset.is_finite() || !(-3.0..=3.0).contains(&offset))
            {
                return error(
                    "invalidCaptions",
                    "Use nonempty captions up to 10000 characters with finite valid times and placement.",
                );
            }
        }
        import
            .cues
            .sort_by(|left, right| left.start.total_cmp(&right.start));
        if import
            .cues
            .windows(2)
            .any(|pair| pair[1].start < pair[0].end)
        {
            return error(
                "invalidCaptions",
                "Overlapping captions cannot share the browser caption lane; adjust their times before importing.",
            );
        }
        let timeline = self.editor.project().active();
        let reused = import
            .replace_clip_ids
            .first()
            .and_then(|id| timeline.clip(id))
            .map(|clip| clip.track_id.clone())
            .filter(|track_id| {
                import.replace_clip_ids.iter().all(|id| {
                    timeline
                        .clip(id)
                        .is_some_and(|clip| clip.track_id == *track_id)
                }) && timeline
                    .clips
                    .iter()
                    .all(|clip| clip.track_id != *track_id || replaced.contains(clip.id.as_str()))
            });
        let reusable_top = timeline
            .tracks
            .last()
            .filter(|track| {
                track.visible && !timeline.clips.iter().any(|clip| clip.track_id == track.id)
            })
            .map(|track| track.id.clone());
        let existing_track = reused.or(reusable_top);
        let mut commands = Vec::with_capacity(import.cues.len() + 2);
        if !import.replace_clip_ids.is_empty() {
            commands.push(Command::RemoveClips {
                clip_ids: import.replace_clip_ids,
                ripple: false,
            });
        }
        let track_id = if import.cues.is_empty() {
            None
        } else if let Some(track) = existing_track {
            Some(track)
        } else {
            if track_count(&self.editor) >= MAX_TRACKS {
                return error(
                    "projectCapacity",
                    "No reusable caption lane remains within the 64-track limit.",
                );
            }
            // Reserve a native ID on an exact probe clone. The committed Batch
            // replays AddTrack first with the same mint, so this ID stays exact.
            let mut probe = self.editor.clone();
            let track = match probe.apply(Command::AddTrack { bottom: false }) {
                Ok(outcome) => outcome.created_id,
                Err(reason) => return error("commandRejected", &reason.to_string()),
            };
            commands.push(Command::AddTrack { bottom: false });
            track
        };
        for cue in import.cues {
            let mut style = cue.style.unwrap_or_default();
            style.content = cue.text;
            commands.push(Command::AddTextClip {
                track_id: track_id.clone(),
                above: true,
                start: cue.start,
                duration: Some(cue.end - cue.start),
                style: Some(style),
                offset_y: cue.offset_y.or(Some(0.35)),
            });
        }
        self.apply_staged(Command::Batch { commands })
    }

    /// Undoes the latest real shared-engine edit.
    pub fn undo(&mut self) -> String {
        let applied = self.editor.undo();
        self.response(applied, None)
    }

    /// Replays the latest undone real shared-engine edit.
    pub fn redo(&mut self) -> String {
        let applied = self.editor.redo();
        self.response(applied, None)
    }

    /// Returns the current document and history availability without mutation.
    pub fn snapshot(&self) -> String {
        self.response(false, None)
    }

    /// Returns a native-format document for the caller to persist or download.
    /// This method does not claim that browser storage succeeded.
    pub fn save_project(&self) -> String {
        self.response(false, None)
    }
}

impl WebEditor {
    fn apply_staged(&mut self, command: Command) -> String {
        // Clone the exact session, including the monotonic ID mint and both
        // history stacks. Rebuilding from JSON would resurrect retired IDs.
        let mut staged = self.editor.clone();
        match staged.apply(command) {
            Ok(outcome) => {
                if !within_capacity(&staged) {
                    return error(
                        "projectCapacity",
                        "The staged edit exceeds browser project limits.",
                    );
                }
                if encoded_len(&staged.to_document(&document_settings(&self.name, &staged)))
                    > MAX_DOCUMENT_BYTES
                {
                    return error(
                        "documentTooLarge",
                        "The staged edit exceeds the browser document limit.",
                    );
                }
                self.editor = staged;
                self.response(outcome.applied, outcome.created_id)
            }
            Err(reason) => error("commandRejected", &reason.to_string()),
        }
    }
    fn document(&self) -> Value {
        self.editor
            .to_document(&document_settings(&self.name, &self.editor))
    }
    fn response(&self, applied: bool, created_id: Option<String>) -> String {
        encode(json!({
            "ok": true, "document": self.document(), "canUndo": self.editor.can_undo(),
            "canRedo": self.editor.can_redo(), "applied": applied, "createdId": created_id
        }))
    }
}

fn settings(options: &CreateOptions) -> DocumentSettings {
    DocumentSettings {
        name: options.name.clone(),
        width: options.width,
        height: options.height,
        rate_num: options.rate_num,
        rate_den: options.rate_den,
    }
}
fn document_settings(name: &str, editor: &Editor) -> DocumentSettings {
    let video = editor.project().active().video;
    DocumentSettings {
        name: name.to_owned(),
        width: video.width,
        height: video.height,
        rate_num: video.rate_num,
        rate_den: video.rate_den,
    }
}
fn valid_name(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= 128
}
fn clip_count(editor: &Editor) -> usize {
    editor
        .project()
        .timelines
        .iter()
        .map(|timeline| timeline.clips.len())
        .sum()
}
fn track_count(editor: &Editor) -> usize {
    editor
        .project()
        .timelines
        .iter()
        .map(|timeline| timeline.tracks.len())
        .sum()
}
fn within_capacity(editor: &Editor) -> bool {
    editor.project().media.len() <= MAX_MEDIA
        && clip_count(editor) <= MAX_CLIPS
        && track_count(editor) <= MAX_TRACKS
        && editor.project().timelines.len() <= MAX_TIMELINES
}
fn encoded_len(value: &Value) -> usize {
    serde_json::to_vec(value).map_or(usize::MAX, |bytes| bytes.len())
}
fn encode(value: Value) -> String {
    serde_json::to_string(&value).unwrap_or_else(|_| r#"{"ok":false,"error":{"code":"internalError","message":"Could not serialize the engine response."}}"#.to_owned())
}
fn error(code: &str, message: &str) -> String {
    encode(json!({"ok": false, "error": {"code": code, "message": message}}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(text: String) -> Value {
        serde_json::from_str(&text).expect("JSON response")
    }
    fn apply(editor: &mut WebEditor, value: Value) -> Value {
        let result = response(editor.apply_command(&value.to_string()));
        assert_eq!(result["ok"], true, "{result}");
        result
    }
    fn imported(editor: &mut WebEditor) -> String {
        let result = apply(
            editor,
            json!({"op":"addMedia","item":{
                "path":"browser:fixture","name":"Portrait sample","kind":"video",
                "duration":6.0,"width":720,"height":1280,"frameRate":30.0,
                "frameRateFraction":"30/1","hasAudio":true
            }}),
        );
        result["createdId"].as_str().expect("media id").to_owned()
    }

    #[test]
    fn browser_sequence_uses_engine_source_continuity_history_and_native_roundtrip() {
        let mut editor = WebEditor::new();
        assert_eq!(
            response(editor.create_project(r#"{"name":"سلام VeyCut","width":720,"height":1280}"#))["ok"],
            true
        );
        let media_id = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media_id,"trackId":"T1","start":0}),
        );
        let clip_id = added["createdId"].as_str().unwrap();
        let split = apply(
            &mut editor,
            json!({"op":"splitClips","clipIds":[clip_id],"time":3.0}),
        );
        let pieces = split["document"]["clips"].as_array().unwrap();
        assert_eq!(pieces.len(), 2);
        assert_eq!(pieces[0]["duration"], 3.0);
        assert_eq!(pieces[1]["start"], 3.0);
        assert_eq!(pieces[1]["sourceStart"], 3.0);
        let original_split = split["document"].clone();
        apply(
            &mut editor,
            json!({"op":"trimClip","clipId":clip_id,"edge":"end","delta":-1.0}),
        );
        assert_eq!(
            response(editor.snapshot())["document"]["clips"][0]["duration"],
            2.0
        );
        assert_eq!(response(editor.undo())["document"], original_split);
        assert_eq!(
            response(editor.undo())["document"]["clips"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(response(editor.redo())["document"], original_split);
        let after_trim = response(editor.redo());
        let saved = response(editor.save_project())["document"].clone();
        assert_eq!(saved, after_trim["document"]);
        let mut reopened = WebEditor::new();
        let opened = response(reopened.open_project(&saved.to_string()));
        assert_eq!(opened["ok"], true);
        assert_eq!(opened["document"], saved);
        assert_eq!(opened["canUndo"], false);
        assert_eq!(opened["canRedo"], false);
    }

    #[test]
    fn browser_failures_preserve_project_history_and_ids() {
        let mut editor = WebEditor::new();
        imported(&mut editor);
        let before = response(editor.snapshot());
        for invalid in [
            json!({"op":"addClip","mediaId":"missing","trackId":"T1","start":0}),
            json!({"op":"batch","commands":[{"op":"batch","commands":[]}]}),
        ] {
            assert_eq!(
                response(editor.apply_command(&invalid.to_string()))["ok"],
                false
            );
            assert_eq!(response(editor.snapshot()), before);
        }
        for settings in [
            r#"{"width":8194}"#,
            r#"{"rateNum":0}"#,
            r#"{"rateDen":-1}"#,
            r#"{"name":" "}"#,
            r#"{"height":721}"#,
            r#"{"width":2,"rateNum":241}"#,
        ] {
            assert_eq!(response(editor.create_project(settings))["ok"], false);
            assert_eq!(response(editor.snapshot()), before);
        }
        assert_eq!(
            response(editor.open_project(r#"{"version":999,"clips":[]}"#))["ok"],
            false
        );
        assert_eq!(response(editor.snapshot()), before);
        assert_eq!(
            response(editor.apply_command(&" ".repeat(MAX_REQUEST_BYTES + 1)))["error"]["code"],
            "requestTooLarge"
        );
        assert_eq!(response(editor.snapshot()), before);
        let next = apply(
            &mut editor,
            json!({"op":"addMedia","item":{
                "path":"browser:next","name":"Next","kind":"video","duration":2.0,"hasAudio":false
            }}),
        );
        assert_eq!(next["createdId"], "m2");
    }

    #[test]
    fn browser_atomic_batch_trims_moves_and_rolls_back_invalid_edits() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let id = added["createdId"].as_str().unwrap();
        let baseline = added["document"].clone();
        let trimmed = apply(
            &mut editor,
            json!({"op":"batch","commands":[
                {"op":"trimClip","clipId":id,"edge":"start","delta":1.0},
                {"op":"trimClip","clipId":id,"edge":"end","delta":-1.0},
                {"op":"moveClips","moves":[{"clipId":id,"start":0.0,"trackId":"T1"}]}
            ]}),
        );
        assert_eq!(trimmed["document"]["clips"][0]["start"], 0.0);
        assert_eq!(trimmed["document"]["clips"][0]["sourceStart"], 1.0);
        assert_eq!(trimmed["document"]["clips"][0]["duration"], 4.0);
        assert_eq!(response(editor.undo())["document"], baseline);
        assert_eq!(response(editor.redo())["document"], trimmed["document"]);
        let before_failure = response(editor.snapshot());
        let failure = response(
            editor.apply_command(
                &json!({"op":"batch","commands":[
                    {"op":"trimClip","clipId":id,"edge":"end","delta":-1.0},
                    {"op":"addClip","mediaId":"missing","trackId":"T1","start":0}
                ]})
                .to_string(),
            ),
        );
        assert_eq!(failure["error"]["code"], "commandRejected");
        assert_eq!(response(editor.snapshot()), before_failure);
    }

    #[test]
    fn browser_split_capacity_rejection_does_not_consume_undo() {
        let mut editor = WebEditor::new();
        let media_id = imported(&mut editor);
        let clip = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media_id,"trackId":"T1","start":0}),
        );
        let clip_id = clip["createdId"].as_str().unwrap();
        let before = response(editor.snapshot());
        let result = response(
            editor.apply_command(
                &json!({
                    "op":"splitClips","clipIds":vec![clip_id;MAX_CLIPS],"time":3
                })
                .to_string(),
            ),
        );
        assert_eq!(result["error"]["code"], "projectCapacity");
        assert_eq!(response(editor.snapshot()), before);
        assert_eq!(response(editor.undo())["document"]["clips"], json!([]));
    }

    #[test]
    fn browser_native_group_edits_preserve_styling_links_and_single_step_history() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let id = added["createdId"].as_str().unwrap().to_owned();
        let original = added["document"].clone();
        let styled = apply(
            &mut editor,
            json!({"op":"batch","commands":[
                {"op":"setClipSpeed","clipId":id,"speed":2},
                {"op":"setClipTransform","clipId":id,"scale":1.4,"offsetX":0.2,"rotation":15,"stretchY":1.3},
                {"op":"updateClip","clipId":id,"patch":{"volume":0.6,"opacity":0.75,"fadeIn":0.2,
                    "transitionIn":{"id":"cross-fade","duration":0.4},"flipH":true}},
                {"op":"setClipKey","clipId":id,"property":"opacity","at":0,"value":0.2},
                {"op":"setClipKey","clipId":id,"property":"opacity","at":1,"value":0.9},
                {"op":"setTrackFlag","trackId":"T1","flag":"muted","value":true}
            ]}),
        );
        assert_eq!(styled["document"]["clips"][0]["duration"], 3.0);
        assert_eq!(response(editor.undo())["document"], original);
        assert_eq!(response(editor.redo())["document"], styled["document"]);
        let duplicated = apply(&mut editor, json!({"op":"duplicateClip","clipId":id}));
        let clips = duplicated["document"]["clips"].as_array().unwrap();
        assert_eq!(clips.len(), 2);
        let mut expected = clips[0].clone();
        expected["id"] = clips[1]["id"].clone();
        expected["start"] = json!(3.0);
        assert_eq!(
            clips[1], expected,
            "complete native properties survive duplication"
        );
        assert_eq!(response(editor.undo())["document"], styled["document"]);
        assert_eq!(response(editor.redo())["document"], duplicated["document"]);

        let detached = apply(&mut editor, json!({"op":"detachAudio","clipId":id}));
        let before_paste = detached["document"].clone();
        let video = before_paste["clips"]
            .as_array()
            .unwrap()
            .iter()
            .find(|clip| clip["id"] == id)
            .unwrap();
        let sound = before_paste["clips"]
            .as_array()
            .unwrap()
            .iter()
            .find(|clip| clip["detachedFrom"] == id)
            .unwrap();
        let mut snapshots = vec![video.clone(), sound.clone()];
        for clip in &mut snapshots {
            clip["start"] = json!(12.0);
        }
        let pasted = apply(&mut editor, json!({"op":"pasteClips","clips":snapshots}));
        let new = pasted["document"]["clips"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|clip| clip["start"] == 12.0)
            .collect::<Vec<_>>();
        assert_eq!(new.len(), 2);
        let new_video = new.iter().find(|clip| clip["kind"] == "video").unwrap();
        let new_sound = new.iter().find(|clip| clip["kind"] == "audio").unwrap();
        assert_eq!(new_sound["detachedFrom"], new_video["id"]);
        assert_ne!(new_video["id"], video["id"]);
        assert_eq!(new_video["keys"], video["keys"]);
        assert_eq!(new_video["transitionIn"], video["transitionIn"]);
        assert_eq!(response(editor.undo())["document"], before_paste);
        assert_eq!(response(editor.redo())["document"], pasted["document"]);
        let before_failure = response(editor.snapshot());
        let mut conflict = snapshots;
        conflict[0]["start"] = json!(0.0);
        assert_eq!(
            response(
                editor.apply_command(&json!({"op":"pasteClips","clips":conflict}).to_string())
            )["ok"],
            false
        );
        assert_eq!(
            response(editor.snapshot()),
            before_failure,
            "conflicting group leaves IDs and history unchanged"
        );
        let mut reopened = WebEditor::new();
        assert_eq!(
            response(reopened.open_project(&pasted["document"].to_string()))["document"],
            pasted["document"]
        );
    }

    #[test]
    fn browser_timeline_settings_and_capacity_failures_preserve_history() {
        let mut editor = WebEditor::new();
        let first = response(editor.snapshot())["document"]["activeTimelineId"].clone();
        let second = apply(&mut editor, json!({"op":"addTimeline"}));
        let second_id = second["createdId"].clone();
        let configured = apply(
            &mut editor,
            json!({"op":"batch","commands":[
                {"op":"renameTimeline","timelineId":second_id,"name":"Landscape cut"},
                {"op":"setTimelineVideo","timelineId":second_id,"video":{"width":1920,"height":1080,"rateNum":60000,"rateDen":1001}},
                {"op":"selectTimeline","timelineId":first}
            ]}),
        );
        assert_eq!(configured["document"]["activeTimelineId"], first);
        let timeline = configured["document"]["timelines"]
            .as_array()
            .unwrap()
            .iter()
            .find(|timeline| timeline["id"] == second_id)
            .unwrap();
        assert_eq!(timeline["name"], "Landscape cut");
        assert_eq!(timeline["video"]["rateNum"], 60000);
        assert_eq!(response(editor.undo())["document"], second["document"]);
        assert_eq!(response(editor.redo())["document"], configured["document"]);
        while editor.editor.project().timelines.len() < MAX_TIMELINES {
            apply(&mut editor, json!({"op":"addTimeline"}));
        }
        let before = response(editor.snapshot());
        let rejection = response(
            editor.apply_command(
                &json!({"op":"batch","commands":[
                    {"op":"renameTimeline","timelineId":first,"name":"Must not land"},
                    {"op":"addTimeline"}
                ]})
                .to_string(),
            ),
        );
        assert_eq!(rejection["error"]["code"], "projectCapacity");
        assert_eq!(response(editor.snapshot()), before);
        assert!(response(editor.undo())["applied"].as_bool().unwrap());
        assert_eq!(editor.editor.project().timelines.len(), MAX_TIMELINES - 1);
        let restored = response(editor.redo());
        assert_eq!(restored["document"], before["document"]);
        assert_eq!(restored["canUndo"], before["canUndo"]);
        assert_eq!(restored["canRedo"], before["canRedo"]);
        let invalid = response(
            editor.apply_command(
                &json!({"op":"setTimelineVideo","timelineId":first,
            "video":{"width":8194,"height":1080,"rateNum":30,"rateDen":1}})
                .to_string(),
            ),
        );
        assert_eq!(invalid["error"]["code"], "invalidSettings");
        assert_eq!(response(editor.snapshot()), before);
    }

    #[test]
    fn browser_group_snapshot_capacity_is_reserved_before_any_mutation() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let clip = added["document"]["clips"][0].clone();
        // Short snapshots avoid the request-size limit and isolate the clip
        // capacity gate; native defaults fill the omitted snapshot properties.
        let snapshots = (0..MAX_CLIPS).map(|index| json!({"id":format!("held{index}"),
            "mediaId":clip["mediaId"],"trackId":"T1","kind":"video","start":index*6+6,"duration":6.0}))
            .collect::<Vec<_>>();
        let before = response(editor.snapshot());
        let request = json!({"op":"pasteClips","clips":snapshots}).to_string();
        assert!(request.len() <= MAX_REQUEST_BYTES);
        assert_eq!(
            response(editor.apply_command(&request))["error"]["code"],
            "projectCapacity"
        );
        assert_eq!(response(editor.snapshot()), before);
    }

    #[test]
    fn browser_staged_rejection_preserves_retired_ids_and_redo() {
        // Construct two independent sessions, not a cloned control. IdMint
        // shares one counter across media/clip/track/timeline prefixes.
        let prepare = || {
            let mut editor = WebEditor::new();
            let media = imported(&mut editor);
            let first = apply(
                &mut editor,
                json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
            );
            let first_id = first["createdId"].clone();
            apply(
                &mut editor,
                json!({"op":"removeClips","clipIds":[first_id]}),
            );
            let second = apply(
                &mut editor,
                json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
            );
            response(editor.undo());
            (editor, media, first_id, second)
        };
        let (mut editor, media, first_id, second) = prepare();
        let (mut control, control_media, control_first_id, control_second) = prepare();
        let before_failure = response(editor.snapshot());
        assert_eq!(response(control.snapshot()), before_failure);
        // Only the subject receives an edit that mints a temporary ID before
        // a real missing-reference error. The control sees no such request.
        let failure = response(editor.apply_command(&json!({"op":"batch","commands":[
            {"op":"addClip","mediaId":media,"trackId":"T1","start":0},
            {"op":"pasteClips","clips":[{"id":"held","kind":"video","mediaId":"missing","trackId":"T1","start":10,"duration":1}]}
        ]}).to_string()));
        assert_eq!(failure["error"]["code"], "commandRejected");
        assert_eq!(response(editor.snapshot()), before_failure);
        assert_eq!(response(editor.redo()), response(control.redo()));
        assert_eq!(response(editor.snapshot())["document"], second["document"]);
        assert_eq!(second, control_second);
        let removed = apply(
            &mut editor,
            json!({"op":"removeClips","clipIds":[second["createdId"]]}),
        );
        assert_eq!(
            removed,
            apply(
                &mut control,
                json!({"op":"removeClips","clipIds":[control_second["createdId"]]}),
            )
        );
        let third = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let control_third = apply(
            &mut control,
            json!({"op":"addClip","mediaId":control_media,"trackId":"T1","start":0}),
        );
        assert_eq!(
            third, control_third,
            "refused staged edit must not consume an ID or change document/history"
        );
        assert_ne!(third["createdId"], first_id, "deleted IDs stay retired");
        assert_ne!(
            third["createdId"], second["createdId"],
            "undone IDs stay retired"
        );
        assert_eq!(first_id, control_first_id);
        assert_eq!(response(editor.undo()), response(control.undo()));
        assert_eq!(response(editor.redo()), response(control.redo()));
    }

    fn caption_import(
        editor: &mut WebEditor,
        replace: Vec<String>,
        count: usize,
        label: &str,
    ) -> Value {
        let cues = (0..count).map(|index| json!({
            "start": index as f64, "end": index as f64 + 0.8,
            "text": format!("{label} {index} سلام"),
            "style": {"fontFamily":"Vazirmatn","fontSize":0.06,"fontWeight":600,"color":"#fff"},
            "offsetY":0.35
        })).collect::<Vec<_>>();
        let result = response(
            editor.replace_captions(&json!({"replaceClipIds":replace,"cues":cues}).to_string()),
        );
        assert_eq!(result["ok"], true, "{result}");
        result
    }

    #[test]
    fn browser_large_caption_replace_at_clip_capacity_is_one_native_undo() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let video = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let baseline = video["document"].clone();
        let imported = caption_import(&mut editor, vec![], MAX_CLIPS - 1, "Original");
        let captions = imported["document"]["clips"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|clip| clip["kind"] == "text")
            .collect::<Vec<_>>();
        assert_eq!(captions.len(), 511);
        assert_eq!(
            captions.first().unwrap()["text"]["content"],
            "Original 0 سلام"
        );
        assert_eq!(captions.last().unwrap()["start"], 510.0);
        let old_ids = captions
            .iter()
            .map(|clip| clip["id"].as_str().unwrap().to_owned())
            .collect::<Vec<_>>();
        assert_eq!(old_ids.iter().collect::<HashSet<_>>().len(), 511);
        assert_eq!(response(editor.undo())["document"], baseline);
        assert_eq!(response(editor.redo())["document"], imported["document"]);

        let replaced = caption_import(&mut editor, old_ids.clone(), MAX_CLIPS - 1, "Replacement");
        assert_eq!(
            replaced["document"]["clips"].as_array().unwrap().len(),
            MAX_CLIPS
        );
        assert!(
            replaced["document"]["clips"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|clip| clip["kind"] == "text")
                .all(|clip| !old_ids.contains(&clip["id"].as_str().unwrap().to_owned()))
        );
        assert_eq!(response(editor.undo())["document"], imported["document"]);
        assert_eq!(response(editor.redo())["document"], replaced["document"]);
        let mut reopened = WebEditor::new();
        assert_eq!(
            response(reopened.open_project(&replaced["document"].to_string()))["document"],
            replaced["document"]
        );
    }

    #[test]
    fn browser_caption_import_failures_preserve_complete_session_and_next_ids() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let video = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let before = response(editor.snapshot());
        let mut control = WebEditor {
            editor: editor.editor.clone(),
            name: editor.name.clone(),
        };
        for request in [
            json!({"replaceClipIds":[video["createdId"]],"cues":[]}),
            json!({"replaceClipIds":["missing"],"cues":[]}),
            json!({"cues":[{"start":0,"end":1,"text":"Good"},{"start":1,"end":0.5,"text":"Invalid"}]}),
            json!({"cues":[{"start":0,"end":1,"text":" "}]}),
            json!({"cues":[{"start":0,"end":360001,"text":"Too late"}]}),
            json!({"cues":[{"start":0,"end":1,"text":"Bad placement","offsetY":4}]}),
            json!({"cues":(0..MAX_CLIPS).map(|index| json!({"start":index,"end":index+1,"text":"Capacity"})).collect::<Vec<_>>()}),
        ] {
            assert_eq!(
                response(editor.replace_captions(&request.to_string()))["ok"],
                false
            );
            assert_eq!(response(editor.snapshot()), before);
        }
        assert_eq!(
            response(editor.replace_captions(&" ".repeat(MAX_CAPTION_REQUEST_BYTES + 1)))["error"]
                ["code"],
            "requestTooLarge"
        );
        assert_eq!(response(editor.snapshot()), before);
        // A single caption lane must reject overlaps, never silently move
        // requested cue boundaries through the nearest-gap placement policy.
        let overlap = json!({"cues":vec![json!({"start":0,"end":1,"text":"Overlap"});65]});
        assert_eq!(
            response(editor.replace_captions(&overlap.to_string()))["error"]["code"],
            "invalidCaptions"
        );
        assert_eq!(response(editor.snapshot()), before);
        let actual = caption_import(&mut editor, vec![], 40, "After refusals");
        let expected = caption_import(&mut control, vec![], 40, "After refusals");
        assert_eq!(
            actual, expected,
            "staged capacity failure consumes no live IDs or history"
        );
        assert_eq!(response(editor.undo())["document"], before["document"]);
    }

    #[test]
    fn browser_caption_import_accepts_bounded_unicode_above_scalar_request_limit() {
        let mut editor = WebEditor::new();
        let text = "سلام جهان ".repeat(250);
        let request = json!({"cues":(0..40).map(|index| json!({
            "start":index,"end":index as f64 + 0.8,"text":text
        })).collect::<Vec<_>>()})
        .to_string();
        assert!(request.len() > MAX_REQUEST_BYTES && request.len() <= MAX_CAPTION_REQUEST_BYTES);
        let result = response(editor.replace_captions(&request));
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["document"]["clips"].as_array().unwrap().len(), 40);
        assert_eq!(result["document"]["clips"][0]["text"]["content"], text);
        assert_eq!(response(editor.undo())["document"]["clips"], json!([]));
    }

    #[test]
    fn browser_two_hundred_captions_allocate_one_lane_and_replace_at_track_capacity() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T4","start":0}),
        );
        let original = response(editor.snapshot())["document"].clone();
        let imported = caption_import(&mut editor, vec![], 200, "New lane");
        let titles = imported["document"]["clips"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|clip| clip["kind"] == "text")
            .collect::<Vec<_>>();
        let lane = titles[0]["trackId"].as_str().unwrap().to_owned();
        assert_eq!(
            titles
                .iter()
                .map(|clip| clip["trackId"].as_str().unwrap())
                .collect::<HashSet<_>>()
                .len(),
            1
        );
        assert_eq!(imported["document"]["tracks"].as_array().unwrap().len(), 5);
        assert_eq!(titles[199]["start"], 199.0);
        assert_eq!(
            response(editor.undo())["document"],
            original,
            "new lane and all captions undo together"
        );
        assert_eq!(response(editor.redo())["document"], imported["document"]);
        let ids = titles
            .iter()
            .map(|clip| clip["id"].as_str().unwrap().to_owned())
            .collect::<Vec<_>>();
        while track_count(&editor.editor) < MAX_TRACKS {
            apply(&mut editor, json!({"op":"addTrack"}));
        }
        let top = editor
            .editor
            .project()
            .active()
            .tracks
            .last()
            .unwrap()
            .id
            .clone();
        apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":top,"start":0}),
        );
        let before_replace = response(editor.snapshot());
        let replacement = caption_import(&mut editor, ids, 200, "Same lane");
        assert_eq!(
            replacement["document"]["tracks"].as_array().unwrap().len(),
            MAX_TRACKS
        );
        assert!(
            replacement["document"]["clips"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|clip| clip["kind"] == "text")
                .all(|clip| clip["trackId"] == lane)
        );
        assert_eq!(
            response(editor.undo())["document"],
            before_replace["document"]
        );
        assert_eq!(response(editor.redo())["document"], replacement["document"]);
        let before_failure = response(editor.snapshot());
        let refusal = response(editor.replace_captions(
            r#"{"cues":[{"id":"local-cue","start":0,"end":1,"text":"No lane"}]}"#,
        ));
        assert_eq!(refusal["error"]["code"], "projectCapacity");
        assert_eq!(response(editor.snapshot()), before_failure);
    }

    #[test]
    fn browser_caption_document_budget_failure_discards_staged_ids_and_history() {
        let mut editor = WebEditor::new();
        let mut document = response(editor.snapshot())["document"].clone();
        // An unknown native field must be preserved; leave room for small
        // edits but not this bounded, multilingual caption import.
        document["fixtureReserve"] = json!("x".repeat(MAX_DOCUMENT_BYTES - 512 * 1024));
        assert_eq!(
            response(editor.open_project(&document.to_string()))["ok"],
            true
        );
        let before = response(editor.snapshot());
        let mut control = WebEditor {
            editor: editor.editor.clone(),
            name: editor.name.clone(),
        };
        let text = "سلام ".repeat(1500);
        let request = json!({"cues":(0..50).map(|index| json!({
            "id":format!("local{index}"),"start":index,"end":index as f64+0.8,"text":text
        })).collect::<Vec<_>>()})
        .to_string();
        assert!(request.len() <= MAX_CAPTION_REQUEST_BYTES);
        assert_eq!(
            response(editor.replace_captions(&request))["error"]["code"],
            "documentTooLarge"
        );
        assert_eq!(response(editor.snapshot()), before);
        let actual = caption_import(&mut editor, vec![], 40, "Small");
        let expected = caption_import(&mut control, vec![], 40, "Small");
        assert_eq!(
            actual, expected,
            "discarded successful native staging must not consume live caption IDs"
        );
    }
}
